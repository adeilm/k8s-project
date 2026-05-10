# Revision — Software Factory Platform (Kubernetes CI/CD)

Single-page study document for the oral defense. Based on the actual codebase (this repo) and the working state on 2026-05-08.

---

## 1. Current Architecture

```
HOST (Windows + VirtualBox)
│
├── 4 VMs (Vagrant)
│
├── k8s-master   192.168.56.10  2 vCPU / 4 GB
│     • Kubernetes control plane (kube-apiserver, etcd, scheduler, controller-manager)
│     • Jenkins runs HERE (inside the cluster, namespace "jenkins")
│
├── k8s-worker1  192.168.56.11  2 vCPU / 2 GB
│     • Runs application pods (todo-frontend / todo-backend / postgres / Jenkins build agents)
│
├── k8s-worker2  192.168.56.12  2 vCPU / 2 GB
│     • Same role as worker1
│
└── services     192.168.56.20  2 vCPU / 4 GB    (NOT a Kubernetes node)
      • Gitea          — port 3000   (self-hosted Git)
      • Nexus UI       — port 8081   (admin / artifact browse)
      • Nexus Docker   — port 8082   (private Docker registry)
      • NFS server     — exports /srv/nfs/{jenkins-data, todo-postgres-data, mysql-data}
      • Ansible runner — runs the playbook against all 4 VMs over SSH
```

### Networking

- Host-only network `192.168.56.0/24` for VM-to-VM traffic.
- Pod network `10.244.0.0/16` (Flannel CNI, forced on `enp0s8` to match host-only NIC).
- Service network `10.96.0.0/12` (default Kubernetes ClusterIP range).
- NGINX Ingress Controller available on NodePort `31080` for path/host-based routing.
- Individual services also exposed via **NodePort** for direct access.

### Runtime

- Container runtime on Kubernetes nodes: **containerd** (CRI standard).
- Container runtime on the `services` VM: **Docker CE** (only because Gitea + Nexus run as Docker containers there; Jenkins itself runs as a Kubernetes Pod, not Docker).

---

## 2. Project Structure

```
k8s-project/
├── Vagrantfile                         # Defines 4 VMs, runs Ansible from "services" VM
├── README.md                           # Quick start and verification commands
├── DOCUMENTATION.md                    # Long-form technical reference (FR)
├── REVISION.md                         # ← THIS FILE
│
├── ansible/
│   ├── ansible.cfg                     # Ansible configuration (vault, roles path)
│   ├── .vault_pass                     # Vault password file (gitignored)
│   ├── inventory.ini                   # Groups: masters, workers, services, k8s_nodes
│   ├── site.yml                        # Main orchestrator — imports all playbooks
│   ├── group_vars/all/
│   │   ├── vars.yml                    # Non-secret variables
│   │   └── vault.yml                   # Encrypted secrets (ansible-vault)
│   ├── playbooks/                      # Standalone playbooks (can run individually)
│   │   ├── cluster-prepare.yml         # common + containerd + kubernetes
│   │   ├── cluster-init.yml            # master init + Flannel CNI
│   │   ├── cluster-join.yml            # workers join
│   │   ├── services-prepare.yml        # services VM base setup
│   │   ├── services-deploy.yml         # NFS + Docker + Gitea + Nexus
│   │   ├── jenkins.yml                 # Helm + Jenkins deployment
│   │   ├── ingress.yml                 # NGINX Ingress Controller via Helm
│   │   └── validate.yml                # Cluster health checks
│   └── roles/
│       ├── common/                     # Swap off, kernel modules, sysctl, /etc/hosts
│       ├── containerd/                 # containerd install + insecure registry config
│       ├── kubernetes/                 # kubeadm/kubelet/kubectl pinned at 1.29.2-1.1
│       ├── master/                     # kubeadm init + kube-proxy ConfigMap fix
│       ├── workers/                    # kubeadm join with dynamic token
│       ├── cni/                        # Flannel manifest with --iface=enp0s8
│       ├── nfs/                        # nfs-kernel-server + 3 exports
│       ├── docker/                     # Docker CE (services VM only)
│       ├── gitea/                      # Gitea via Docker Compose
│       ├── nexus/                      # Nexus 3 via Docker Compose
│       ├── helm/                       # Helm 3 binary installation
│       ├── jenkins/                    # Jenkins via Helm chart + RBAC + NFS PV
│       └── nginx-ingress/              # NGINX Ingress Controller via Helm
│
└── apps/todo/
    ├── frontend/    Dockerfile, index.html, app.js, style.css   (nginx serving static UI)
    ├── backend/     Dockerfile, package.json, src/{server.js, db.js}  (Node.js + Express + pg)
    └── k8s/         namespace.yml, postgres.yml, backend.yml, frontend.yml
```

The two **pipeline repositories** live OUTSIDE this folder (separate Git repos in Gitea):

- `admin/todo-frontend` — frontend source + its own `Dockerfile` + `Jenkinsfile`
- `admin/todo-backend` — backend source + its own `Dockerfile` + `Jenkinsfile`

The Kubernetes manifests stay in this monorepo; the application source lives in Gitea.

---

## 3. CI/CD Workflow

### Trigger flow

```
  Developer
     │ git push
     ▼
  Gitea (192.168.56.20:3000)
     │ webhook POST → http://192.168.56.10:30080/gitea-webhook/post
     ▼
  Jenkins (in K8s, NodePort 30080)
     │ matches the SCM URL of the corresponding Pipeline job
     │ provisions a build agent Pod via the Kubernetes plugin
     ▼
  Build agent Pod (namespace "jenkins")
     ├── jnlp container       — connects back to Jenkins controller
     ├── kaniko container     — builds the Docker image without Docker daemon
     └── kubectl container    — applies the new image to the cluster
     │
     │ stage 1: Checkout      — git clone (credential `gitea-creds`)
     │ stage 2: Build & Push  — kaniko builds image + pushes to Nexus :8082
     │ stage 3: Deploy        — kubectl set image deployment/<app> ...
     ▼
  Nexus     (image stored at 192.168.56.20:8082/<app>:<build-number>)
  Kubernetes (rolling update on the worker pods)
     ▼
  todo-app namespace (workers run the new pods, old pods terminated)
```

### Key files driving the pipeline

| File | Role |
|---|---|
| `Jenkinsfile` (in each Gitea repo) | Pod template + 3 stages |
| `nexus-registry-creds` Secret (Kubernetes, namespace `jenkins` and `todo-app`) | docker-registry secret used by Kaniko (mounted as `/kaniko/.docker/config.json`) and by `imagePullSecrets` in deployments |
| `gitea-creds` Jenkins credential | username/password used by Pipeline SCM checkout |
| Gitea webhook | Per-repo push event → Jenkins URL `/github-webhook/` |

---

## 4. Tools and Why

| Tool | Purpose | Why this one |
|---|---|---|
| **Vagrant** | Reproducible VMs from `Vagrantfile` | Lab is local, no cloud; identical setup on any host with VirtualBox |
| **VirtualBox** | Hypervisor | Free, supported by Vagrant by default |
| **Ansible** | Configure all VMs from split playbooks | Idempotent, agentless (SSH only), runs from the services VM so Windows hosts do not need Ansible |
| **Ansible Vault** | Encrypt sensitive variables | Credentials stored encrypted in `vault.yml`, decrypted at runtime via `.vault_pass` |
| **kubeadm** | Bootstrap the Kubernetes control plane and join nodes | Official, low-level, gives full control. Alternatives: kops (AWS), kubespray (Ansible-heavy), managed (EKS/GKE/AKS) — not local |
| **containerd** | Container runtime on K8s nodes | dockershim removed in K8s 1.24; containerd is the lightweight CRI-native default |
| **Flannel** | CNI providing pod networking | Simple VXLAN overlay, sufficient for a single cluster. Calico/Cilium would be needed for NetworkPolicies |
| **Helm 3** | Kubernetes package manager | Deploys Jenkins and NGINX Ingress via official charts — tested defaults, upgrade paths, less YAML to maintain |
| **NGINX Ingress** | HTTP/HTTPS routing into the cluster | Single entry point replaces per-service NodePorts; supports path/host-based routing |
| **Gitea** | Self-hosted Git server | Lightweight (Go), runs in one Docker container, full GitHub-like UI |
| **Nexus 3** | Private artifact and Docker registry | Hosts our images locally; supports anonymous pulls for cluster pull-through, authenticated push for Jenkins |
| **Jenkins (Helm)** | CI/CD orchestrator | Deployed via Helm chart into Kubernetes; Kubernetes plugin spawns ephemeral build agents per build = clean, parallel, isolated |
| **Kaniko** | Build OCI images **inside a Pod**, no Docker daemon | Daemonless and rootless, avoids exposing the host Docker socket — security improvement over `docker build` from inside Jenkins |
| **kubectl (Bitnami legacy image)** | Apply manifests / set images from the agent Pod | The `bitnami/kubectl` image was deprecated, switched to `bitnamilegacy/kubectl:1.29` |
| **NFS** | ReadWriteMany persistent storage for the cluster | Lets PostgreSQL, Jenkins home, etc. survive Pod rescheduling without cloud-managed disks |

---

## 5. Problems Encountered and Fixes

The honest list — anticipate the professor asking "what didn't work the first time".

| # | Problem | Root cause | Fix (now in repo) |
|---|---|---|---|
| 1 | Worker nodes stuck `NotReady` after `kubeadm join` | kubeadm generates kube-proxy's kubeconfig using the default-route NIC (NAT 10.0.2.15) instead of `--apiserver-advertise-address`. kube-proxy could not reach the API, Flannel crashed | A task in `roles/master/tasks/main.yml` patches the `kube-proxy` ConfigMap to use `master_ip` and restarts the DaemonSet |
| 2 | Pods on worker1 could not reach pods on worker2 | Vagrant VMs have two NICs; Flannel picked NAT (`enp0s3`) instead of host-only (`enp0s8`) | Flannel manifest in `roles/cni` adds `--iface=enp0s8` |
| 3 | `docker push` to Nexus refused with "server gave HTTP response to HTTPS client" | Docker (and containerd) require explicit allow-listing for plain-HTTP registries | `/etc/docker/daemon.json` adds `insecure-registries`; containerd has `/etc/containerd/certs.d/192.168.56.20:8082/hosts.toml` with `skip_verify = true` |
| 4 | NodePort apps unreachable; pods running but no traffic | Same kube-proxy ConfigMap issue as (1), surfaces as soon as a Service is created | Same fix as (1) — solved at install time |
| 5 | Jenkins build agent Pod created but image pull failed for `bitnami/kubectl:1.29` | Bitnami removed images from Docker Hub in August 2025 | Replaced with `bitnamilegacy/kubectl:1.29` in both Jenkinsfiles |
| 6 | Kaniko could not resolve `auth.docker.io` from inside the build agent Pod | CoreDNS forwarded external lookups to `/etc/resolv.conf` which pointed at the systemd-resolved stub `127.0.0.53`, unreachable from a Pod | Patched the `coredns` ConfigMap: `forward . 8.8.8.8 1.1.1.1` |
| 7 | Webhook delivered HTTP 200 but no Jenkins build started | The Gitea Jenkins plugin only triggers Multibranch projects, not plain Pipeline jobs. Plain Pipeline needs a different trigger | Switched the webhook URL to `/github-webhook/` and enabled "GitHub hook trigger for GITScm polling" on the job — the GitHub plugin matches webhooks by SCM URL and is plugin-agnostic |
| 8 | Webhook delivery returned response code 0 | New Gitea versions block private-IP webhook targets by default | Added `[webhook] ALLOWED_HOST_LIST = 192.168.56.0/24,localhost,private` to Gitea's `app.ini` |
| 9 | `kubectl set image` hung for several minutes during deploys | Default kubectl has no client timeout; if the API is briefly slow, the call blocks indefinitely | Added `--request-timeout=30s` to kubectl invocations in the Jenkinsfiles |
| 10 | NFS mount for the postgres Pod failed: "No such file or directory" | The export directory was missing on the services VM (older provision had only `mysql-data`) | `nfs_exports` in `group_vars/all/vars.yml` now lists `mysql-data`, `jenkins-data`, `todo-postgres-data` — the role creates each directory and adds it to `/etc/exports` |
| 11 | `nexus-registry-creds` Secret missing → Kaniko could not authenticate to Nexus | The secret is required both for Kaniko's docker-config mount and for `imagePullSecrets` in the app manifests | The Jenkins role creates the secret via `kubectl create secret docker-registry` in both namespaces |
| 12 | Master Node intermittently flips to `NotReady` after `vagrant halt; vagrant up` | Containerd / kubelet PLEG hangs after VM suspend-resume on a resource-tight host | Documented workaround: `sudo systemctl restart containerd kubelet` on the affected node. Permanent fix would be increasing host RAM or moving Jenkins off NFS |
| 13 | Kaniko hung during `nginx:1.27-alpine` pull with `i/o timeout` even after CoreDNS upstream fix | CoreDNS returned only AAAA (IPv6) records for some upstream lookups; cluster has no IPv6 routing (Flannel + Vagrant are IPv4-only), so Go's HTTP client tried IPv6 first and stalled | Added `template ANY AAAA . { rcode NOERROR }` to the CoreDNS Corefile so every external lookup returns IPv4 only. Now baked into the `master` Ansible role alongside the kube-proxy patch |

---

## 6. Verification and Demo Commands

Run these from the host (Windows Git Bash) when presenting.

### Cluster health

```bash
vagrant ssh k8s-master -c "kubectl get nodes -o wide"
vagrant ssh k8s-master -c "kubectl get pods -A -o wide"
```

Expected: 3 nodes `Ready`, all system pods `Running`.

### Jenkins

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins get pods,svc,pvc"
curl -sI http://192.168.56.10:30080/login    # 200 or 403 = Jenkins is up
```

### Application stack

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get pods,svc,pvc"
curl http://192.168.56.10:30082/api/health   # {"status":"ok"}
# Open in browser: http://192.168.56.10:30081
```

### Show the running images

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get deploy -o jsonpath='{range .items[*]}{.metadata.name}{\": \"}{.spec.template.spec.containers[0].image}{\"\\n\"}{end}'"
# Expected:
#   todo-backend: 192.168.56.20:8082/todo-backend:<N>
#   todo-frontend: 192.168.56.20:8082/todo-frontend:<N>
#   postgres: postgres:16-alpine
```

### Live demo of the full pipeline

```bash
cd /c/Users/HP/DALI/Shared/Project/todo-frontend
# Edit index.html (e.g., change a heading)
git add index.html
git commit -m "Demo: change heading"
git push origin main
```

Then open Jenkins → `todo-frontend` job → watch the new build go through Checkout → Build & Push → Deploy. Once green, refresh `http://192.168.56.10:30081` to see the new content.

### Show what is in Nexus

Browser: `http://192.168.56.20:8081` → Browse → `docker-hosted` → `todo-frontend` / `todo-backend` → list of tags 1, 2, 3, ...

### Show rollout history

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app rollout history deployment/todo-backend"
```

Each Jenkins build = one revision.

---

## 7. Likely Questions and Answers

### Architecture / design

**Q. Why does Jenkins run inside Kubernetes instead of on the services VM?**
A. The professor's spec says "Jenkins on the master node". I went one step further: Jenkins runs *as a Pod scheduled by the master*, with its home directory on NFS. This way Jenkins is self-healing (Kubernetes restarts it if it crashes), backed by persistent storage, and can spawn ephemeral build agents inside the same cluster. It is more cloud-native than running Jenkins as a Docker container on the services VM.

**Q. Why use Kaniko instead of Docker-in-Docker or the host's Docker socket?**
A. Kaniko builds images entirely inside a Pod with no Docker daemon. Mounting the host's `/var/run/docker.sock` would give Jenkins root access to the host (security risk). Docker-in-Docker requires a privileged container. Kaniko avoids both.

**Q. Why two separate Gitea repos (front and back) instead of one monorepo?**
A. The professor's spec says "Jenkins ↔ Front & Back repositories" (plural). Each microservice has its own pipeline, its own image, and can be deployed independently — closer to a real microservices workflow.

**Q. Why containerd and not Docker on the cluster nodes?**
A. Kubernetes 1.24+ removed `dockershim`. containerd is the CRI-native runtime: lighter, recommended by the Kubernetes project, and used by all major managed offerings.

### Networking

**Q. What are the three IP ranges in your cluster?**
A. `192.168.56.0/24` for the VMs (host-only), `10.244.0.0/16` for Pods (Flannel overlay), `10.96.0.0/12` for Services (virtual ClusterIPs). Pods on different nodes communicate over Flannel's VXLAN tunnels.

**Q. How does a request from my browser reach the frontend pod?**
A. Browser hits `192.168.56.10:30081`. kube-proxy's iptables rules on the master (NodePort) DNAT the packet to a backend Pod IP in `10.244.x.x`. If the chosen Pod is on a worker, the packet crosses Flannel's VXLAN tunnel to the right node.

**Q. Are you using Ingress?**
A. Yes. We deploy the NGINX Ingress Controller via Helm on NodePort `31080`. It provides a single HTTP entry point for the cluster. Individual services are still accessible via their own NodePorts for convenience, but Ingress resources can be created for path/host-based routing through the controller.

### Storage

**Q. Where does the database keep its data?**
A. PostgreSQL mounts a PersistentVolumeClaim backed by a PersistentVolume that points to NFS export `/srv/nfs/todo-postgres-data` on the services VM. Pod termination does not lose the data; if Postgres is rescheduled to another worker, it remounts the same NFS share.

**Q. What happens to data if a worker node dies?**
A. Kubernetes reschedules the Postgres Pod to the other worker. The PV is `ReadWriteMany` over NFS, so the new Pod mounts the same data directory — zero data loss.

### CI/CD

**Q. Walk me through what happens after `git push`.**
A. Gitea fires a webhook to `http://192.168.56.10:30080/github-webhook/`. The GitHub plugin in Jenkins matches the webhook payload to the Pipeline job by SCM URL. Jenkins reads the `Jenkinsfile` from the repo, asks the Kubernetes plugin to create a 3-container build agent Pod (jnlp + kaniko + kubectl), then runs Checkout / Build & Push (Kaniko) / Deploy (kubectl set image). The deployment update triggers a rolling update; new Pods replace old ones gradually with zero downtime.

**Q. What did you change to make the build secure?**
A. No Docker socket on the agent. Kaniko runs as a regular Pod with read-only mount of the Nexus credentials secret. Jenkins itself uses a ServiceAccount with namespaced RBAC: it can create Pods only in the `jenkins` namespace and only patch Deployments in the `todo-app` namespace.

**Q. How would you roll back?**
A. `kubectl -n todo-app rollout undo deployment/todo-backend` reverts to the previous ReplicaSet. Or trigger Jenkins on a previous commit and the same flow deploys the old image.

### Operations

**Q. What is the most fragile part?**
A. Cluster stability under VM suspend/resume — the master VM occasionally flips `NotReady` because containerd's PLEG hangs. The fix is `sudo systemctl restart containerd kubelet`. A real fix is more host RAM and pinning Jenkins to the master with stricter resource requests.

**Q. How would you scale this?**
A. Add more workers to the Vagrantfile (or move to a real cluster). The Deployment replicas can scale via `kubectl scale` or HorizontalPodAutoscaler. Jenkins pipelines would automatically use whatever node has capacity since the agent Pods are scheduled by Kubernetes.

### Bonuses (security and quality)

The professor's note allows bonus points around security. We implemented:
- Kaniko (no Docker socket exposure).
- ServiceAccount + RBAC for Jenkins (least privilege).
- Per-namespace `imagePullSecrets` for Nexus.
- Disabled root for the Jenkins container (`runAsUser: 1000`, `fsGroup: 1000`).
- Idempotent Ansible (re-runnable, no manual steps).
- Insecure Nexus registry restricted to `192.168.56.0/24`.
- **Ansible Vault** for encrypted secret management (credentials not in plaintext).
- **Helm** for Jenkins and Ingress (production-grade package management).
- **NGINX Ingress Controller** for HTTP routing into the cluster.
- **Split playbooks** for independent execution of individual stages.
- **Role defaults** documenting the variable interface of each role.

Not implemented (would be additional bonuses): NetworkPolicies (requires Calico, not Flannel), Kubernetes audit logging, Prometheus/Grafana monitoring, TLS on the Nexus endpoint.

---

## 8. Cleanup Summary

Already removed during preparation:

- `docs.md` and `PRESENTATION_GUIDE.md` — duplicated study notes, replaced by this single `REVISION.md`.
- `JENKINS_KANIKO_MIGRATION.md` — internal change log, not part of the deliverable.
- `.kubeconfig-for-jenkins` — old credentials file from an earlier (Docker-socket) Jenkins setup. The current Kaniko-based pipeline does not use it; Jenkins authenticates to the cluster via its ServiceAccount.

Final state of the project root:

```
.gitattributes
.gitignore
DOCUMENTATION.md      ← long-form FR docs (kept)
README.md             ← quick start (updated)
REVISION.md           ← THIS FILE (study aid)
Vagrantfile
ansible/              ← roles, split playbooks, vault, ansible.cfg
apps/todo/            ← frontend + backend + manifests
docs/                 ← Tunisian-dialect Kubernetes guide (LaTeX + PDF) — kept untouched
```

No source code or automation was deleted. Everything that runs the platform is intact.

---

## 9. Live Verification Snapshot

Captured against the running cluster on 2026-05-08 (the day before the defense). Use these as a baseline when re-running the demo: anything that does not match this list is a regression to investigate.

### Cluster

```
NAME          STATUS   ROLES           VERSION   CONTAINER-RUNTIME
k8s-master    Ready    control-plane   v1.29.2   containerd://1.7.28
k8s-worker1   Ready    <none>          v1.29.2   containerd://1.7.28
k8s-worker2   Ready    <none>          v1.29.2   containerd://1.7.28
```

### Endpoint health (HTTP from the host)

| Endpoint | Expected | Verified |
|---|---|---|
| `http://192.168.56.10:30080/login` (Jenkins) | 200 | ✅ |
| `http://192.168.56.10:30081/` (todo-frontend) | 200 | ✅ |
| `http://192.168.56.10:30082/api/health` (todo-backend) | `{"status":"ok"}` | ✅ |
| `http://192.168.56.20:3000/` (Gitea) | 200 | ✅ |
| `http://192.168.56.20:8081/` (Nexus UI) | 200 | ✅ |

### Deployed images (proves the pipeline ran)

```
postgres        : postgres:16-alpine
todo-backend    : 192.168.56.20:8082/todo-backend:11    ← built and deployed by Jenkins
todo-frontend   : 192.168.56.20:8082/todo-frontend:1    ← built and deployed by Jenkins
```

### NFS exports (services VM)

```
/srv/nfs/jenkins-data       192.168.56.0/24
/srv/nfs/todo-postgres-data 192.168.56.0/24
/srv/nfs/mysql-data         192.168.56.0/24
```

### Jenkins service ports (Kubernetes)

```
service/jenkins   NodePort   8080:30080/TCP   ← UI / webhook receiver
                             50000:30142/TCP  ← JNLP agent connect-back port
```

The `50000` port matters: build-agent Pods use it to reach the Jenkins controller from inside the cluster (`JENKINS_TUNNEL=jenkins.jenkins.svc.cluster.local:50000`). The NodePort `30142` is auto-assigned and not used externally.

### Known transient symptom

`kube-controller-manager` and `kube-scheduler` show 100+ restarts because of the recurring containerd PLEG hangs after VM suspend-resume. Pods recover automatically; if anything stalls during the demo, run:

```bash
vagrant ssh k8s-master -c "sudo systemctl restart containerd kubelet"
```

### Reset gotcha for the backend

If `/api/health` returns HTTP 500 with `EAI_AGAIN` in the logs, the backend pod started before CoreDNS finished initialising and gave up on the DB connection. Restart the deployment:

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app rollout restart deployment/todo-backend"
```

It returns `{"status":"ok"}` within ~15 seconds.
