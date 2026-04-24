# Kubernetes Cluster — Local Development Environment with CI/CD

## Overview

A fully automated **self-hosted DevOps platform** provisioned locally with **Vagrant** and **Ansible**: a production-style Kubernetes cluster wired to a complete CI/CD stack (Gitea + Jenkins + Nexus).

Every piece runs on your laptop. Every piece is configured declaratively. A `git push` triggers a full build/push/deploy cycle with zero human intervention.

### Infrastructure

| Node | Hostname | IP | CPU | RAM | Role |
|------|----------|----|-----|-----|------|
| Master | k8s-master | 192.168.56.10 | 2 | 4 GB | Kubernetes control plane |
| Worker 1 | k8s-worker1 | 192.168.56.11 | 2 | 2 GB | Workload node |
| Worker 2 | k8s-worker2 | 192.168.56.12 | 2 | 2 GB | Workload node |
| Services | services | 192.168.56.20 | 2 | 4 GB | NFS + Gitea + Nexus + Jenkins |

**Stack:** Ubuntu 22.04 · Kubernetes 1.29.2 · containerd · Flannel CNI · kubeadm · Docker CE · Gitea · Nexus 3 · Jenkins LTS

---

## The CI/CD Pipeline

This is the centerpiece of the project. End-to-end:

```
Developer: git push origin main
               │
               ▼
           ┌───────┐   webhook    ┌─────────┐
           │ Gitea │ ───────────▶ │ Jenkins │
           └───────┘              └────┬────┘
                                       │
                            ┌──────────┼──────────┐
                            ▼          ▼          ▼
                       docker     docker push   kubectl
                        build        to Nexus    set image
                                       │          │
                                       ▼          ▼
                                  ┌───────┐  ┌──────────────┐
                                  │ Nexus │  │ K8s API      │
                                  └───┬───┘  └──────┬───────┘
                                      │             │
                                      │  pull new   │ rolling
                                      │  image      │ update
                                      ▼             ▼
                              ┌─────────────────────────┐
                              │   Worker pods get       │
                              │   replaced one by one   │
                              │   (zero downtime)       │
                              └─────────────────────────┘
```

### What each tool does

| Tool | Role | Where | URL |
|------|------|-------|-----|
| **Gitea** | Self-hosted Git server — source of truth | services VM | http://192.168.56.20:3000 |
| **Jenkins** | Automation engine — orchestrates the pipeline | services VM | http://192.168.56.20:8080 |
| **Nexus** | Artifact repository — private Docker registry | services VM | http://192.168.56.20:8081 |
| **Nexus Docker endpoint** | Push/pull target for container images | services VM | `192.168.56.20:8082` |
| **Kubernetes** | Runtime — actually runs the application | master + 2 workers | API `192.168.56.10:6443` |

### Demo app: `hello-world`

Deployed application at **http://192.168.56.10:30080** — an nginx pod serving HTML built from source. Change the HTML, push, and the page updates within ~90 seconds automatically.

---

## Prerequisites

- [Vagrant](https://www.vagrantup.com/downloads) (>= 2.3)
- [VirtualBox](https://www.virtualbox.org/wiki/Downloads) (>= 7.0)
- [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/) (>= 2.14)
- ~16 GB RAM free on host (4 VMs total ≈ 12 GB allocated + host overhead)

> **Windows users:** Ansible runs on the host via Vagrant's Ansible provisioner. Git Bash or WSL recommended.

---

## Project Structure

```
k8s-project/
├── Vagrantfile                     # VM definitions & Ansible provisioner
├── docs/
│   ├── kubernetes-guide-tunisien.tex   # 87-page K8s learning guide (Tunisian dialect)
│   └── kubernetes-guide-tunisien.pdf
├── k8s-apps/                       # Kubernetes manifests for demo apps
│   ├── hello-world/                # Original ConfigMap-based version
│   └── hello-world-v2/             # Image-based version (managed by Jenkins)
├── ansible/
│   ├── inventory.ini
│   ├── group_vars/all.yml          # kube_version, master_ip, pod CIDR, ports
│   ├── roles/
│   │   ├── common/                 # swap, kernel modules, sysctl, packages
│   │   ├── containerd/             # runtime + insecure Nexus registry config
│   │   ├── kubernetes/             # kubeadm, kubelet, kubectl (pinned)
│   │   ├── master/                 # kubeadm init + kube-proxy ConfigMap fix
│   │   ├── workers/                # kubeadm join
│   │   ├── cni/                    # Flannel with dual-NIC fix
│   │   ├── nfs/                    # NFS server + exports
│   │   ├── docker/                 # Docker CE for services VM
│   │   ├── gitea/                  # Git server (Docker Compose)
│   │   ├── nexus/                  # Artifact registry (Docker Compose)
│   │   └── jenkins/                # CI/CD server (Docker Compose)
│   └── playbook.yml
└── README.md
```

---

## Quick Start — Bring Up the Whole Cluster

### First-time provisioning

```bash
vagrant up
```

This creates the 4 VMs and runs the full Ansible playbook (~30 min first time). Once complete you have:

- 3-node Kubernetes cluster, all Ready
- Flannel CNI configured with correct host-only interface
- Gitea / Nexus / Jenkins running as Docker containers on services VM
- NFS server exporting `/srv/nfs/mysql-data`
- Nexus Docker registry reachable as `192.168.56.20:8082`
- Containerd on all nodes configured to pull from the insecure Nexus registry

### Subsequent boots (cluster already provisioned)

```bash
vagrant up --no-provision
```

Skips re-running Ansible. Just boots the VMs and lets systemd bring services back up (~3 min).

### Verify cluster health

```bash
vagrant ssh k8s-master -c "kubectl get nodes"
vagrant ssh k8s-master -c "kubectl get pods -A"
vagrant ssh services -c "sudo docker ps"
```

Expected: 3 nodes `Ready`, all system pods `Running`, 3 service containers `Up`.

---

## Deploy Your Own App via the Pipeline

Once the cluster is up, you can use the pipeline to deploy your own app. Here's the recipe that powers the `hello-world` demo.

### 1. Create a Gitea repo
Navigate to http://192.168.56.20:3000 → `+` → New Repository → give it a name.

### 2. Clone it locally
```bash
git clone http://admin@192.168.56.20:3000/admin/myapp.git
cd myapp
```

### 3. Add three things to the repo

**`Dockerfile`** — how to build your image:
```dockerfile
FROM nginx:alpine
COPY index.html /usr/share/nginx/html/index.html
```

**`Jenkinsfile`** — declarative pipeline:
```groovy
pipeline {
  agent any
  environment {
    REGISTRY = '192.168.56.20:8082'
    IMAGE    = 'myapp'
    TAG      = "${env.BUILD_NUMBER}"
  }
  stages {
    stage('Checkout') { steps { checkout scm } }
    stage('Build')    { steps { sh 'docker build -t ${REGISTRY}/${IMAGE}:${TAG} .' } }
    stage('Push') {
      steps {
        withCredentials([usernamePassword(credentialsId: 'nexus-creds',
                                          usernameVariable: 'U', passwordVariable: 'P')]) {
          sh 'echo $P | docker login $REGISTRY -u $U --password-stdin'
          sh 'docker push $REGISTRY/$IMAGE:$TAG'
        }
      }
    }
    stage('Deploy') {
      steps {
        withKubeConfig([credentialsId: 'kubeconfig']) {
          retry(5) {
            sleep 3
            sh 'kubectl set image deployment/myapp nginx=${REGISTRY}/${IMAGE}:${TAG}'
          }
          sh 'kubectl rollout status deployment/myapp --timeout=60s || true'
        }
      }
    }
  }
}
```

**`k8s/deployment.yaml` + `k8s/service.yaml`** — your Kubernetes manifests (with `image: 192.168.56.20:8082/myapp:1`).

### 4. First-time manual deploy

Build and push the initial image, then apply manifests:

```bash
vagrant ssh services
git clone http://admin@192.168.56.20:3000/admin/myapp.git
cd myapp
sudo docker build -t 192.168.56.20:8082/myapp:1 .
echo 'adminadmin' | sudo docker login 192.168.56.20:8082 -u admin --password-stdin
sudo docker push 192.168.56.20:8082/myapp:1
exit

# Apply manifests
cat myapp/k8s/deployment.yaml | vagrant ssh k8s-master -c "kubectl apply -f -"
cat myapp/k8s/service.yaml    | vagrant ssh k8s-master -c "kubectl apply -f -"
```

### 5. Wire up Jenkins

1. **Credentials** (Manage Jenkins → Credentials → System → Global):
   - `nexus-creds` — username/password, admin/adminadmin
   - `gitea-creds` — username/password, admin/adminadmin
   - `kubeconfig` — secret file, upload `/etc/kubernetes/admin.conf` from master
2. **New Pipeline job** pointing at the Gitea repo URL, `Jenkinsfile` as script path
3. **Gitea webhook**: Repo Settings → Webhooks → Add Webhook → Gitea
   - Target URL: `http://192.168.56.20:8080/gitea-webhook/post`
   - Content type: `application/json`, Trigger: Push Events

From now on: `git push` → auto-build → auto-deploy → page updates.

---

## Key Design Decisions Explained

### Why containerd, not Docker, inside the cluster
Kubernetes 1.24 removed `dockershim`. Containerd is the lighter, CRI-native runtime. Docker is still used on the **services VM** to run Gitea/Nexus/Jenkins containers and to build images in Jenkins pipelines — two different jobs.

### Why the kube-proxy ConfigMap patch
`kubeadm init` generates kube-proxy's kubeconfig using the default-route interface (NAT 10.0.2.15 on Vagrant), not `--apiserver-advertise-address`. Without patching, kube-proxy can't reach the API, Flannel crashes, and workers stay NotReady. Patched automatically by the `master` role after init.

### Why Flannel's `--iface=enp0s8`
Vagrant VMs have two NICs: `enp0s3` (NAT, 10.0.2.15) and `enp0s8` (host-only, 192.168.56.x). Without forcing the host-only interface, Flannel picks the wrong one and pods on different nodes can't reach each other.

### Why the Nexus registry is "insecure"
No TLS on the registry for simplicity (local dev). Both Docker (on services VM) and containerd (on all K8s nodes) are configured to accept plain HTTP for `192.168.56.20:8082`:
- `/etc/docker/daemon.json` → `insecure-registries`
- `/etc/containerd/certs.d/192.168.56.20:8082/hosts.toml` → `skip_verify = true`

### Why Nexus anonymous access is enabled
K8s nodes need to pull images without authenticating. Enabling anonymous reads avoids the complexity of managing `imagePullSecrets` in every Deployment. Push still requires login.

### Why Jenkins uses the host's Docker socket
The Jenkins container has `/var/run/docker.sock` bind-mounted from the host. This lets Jenkins run `docker build` without Docker-in-Docker. Trade-off: Jenkins effectively has root access to the host's Docker — fine for isolated dev, NOT for shared production.

### Why `retry(5)` in the Deploy stage
Locally, the K8s API server can briefly become unreachable under resource pressure (4 VMs on one laptop). Retrying the `kubectl set image` command 5× with a short sleep masks these transient blips without hiding real failures.

---

## Management Commands

```bash
vagrant halt                     # Stop all VMs (preserve state)
vagrant up --no-provision        # Boot VMs, skip Ansible
vagrant provision                # Re-run Ansible against running VMs
vagrant destroy -f               # Delete everything (irreversible)
vagrant status                   # Show all VM states
vagrant ssh <name>               # Shell into a specific VM
```

---

## Troubleshooting

### Node shows `NotReady` after boot
Transient containerd/PLEG hang — very common after `vagrant halt; vagrant up`. Restart the runtime:

```bash
vagrant ssh <node> -c "sudo systemctl restart containerd kubelet"
```

Node flips Ready within ~30 seconds.

### `VBoxManage: E_ACCESSDENIED`
Orphan `<inaccessible>` VMs from other projects are confusing VirtualBox. Unregister them:

```bash
"/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" list vms
# Find the <inaccessible> UUIDs, then for each:
"/c/Program Files/Oracle/VirtualBox/VBoxManage.exe" unregistervm <UUID>
```

`unregistervm` doesn't delete VM files on disk — only removes them from VirtualBox's registry.

### Pipeline fails at `Deploy` with "TLS handshake timeout"
API server is under pressure. Either:
1. Wait 30 seconds and click **Build Now** again, OR
2. Restart control plane runtime: `vagrant ssh k8s-master -c "sudo systemctl restart containerd kubelet"`

### Can't push to Nexus: "http: server gave HTTP response to HTTPS client"
Docker (or containerd) isn't configured for the insecure registry. On the affected machine:

```bash
# Docker
sudo bash -c 'echo "{\"insecure-registries\": [\"192.168.56.20:8082\"]}" > /etc/docker/daemon.json'
sudo systemctl restart docker

# Containerd
sudo mkdir -p /etc/containerd/certs.d/192.168.56.20:8082
# (populate hosts.toml with skip_verify=true, restart containerd)
```

### Gitea repo is hidden after first-run wizard
Gitea's first-run wizard takes ~30 seconds to write config. If you refresh too fast, you may see a blank page. Wait, then go to http://192.168.56.20:3000 and log in.

---

## What's NOT Automated (Intentionally Manual)

These are one-time UI steps — kept out of the playbook because they're tied to personal accounts:

1. Gitea first-run wizard (creates admin user, picks DB)
2. Nexus initial password change
3. Jenkins initial admin user creation
4. Jenkins plugin installation
5. Jenkins credential creation
6. Creating Gitea webhooks on specific repos

Everything below this line (VMs, networking, K8s, container runtimes, apt repos, service containers) is 100% Ansible-managed.

---

## Further Reading

- Full Kubernetes concepts guide in Tunisian dialect: [docs/kubernetes-guide-tunisien.pdf](docs/kubernetes-guide-tunisien.pdf) (87 pages)
- Official Kubernetes docs: https://kubernetes.io/docs/
- Jenkins pipeline syntax: https://www.jenkins.io/doc/book/pipeline/syntax/
- Gitea webhook docs: https://docs.gitea.com/usage/webhooks
