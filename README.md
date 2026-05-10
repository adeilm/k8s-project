# Kubernetes Cluster — Local DevOps Lab

## Overview

This project provisions a local, Vagrant-based Kubernetes lab with a supporting services VM. The infrastructure is managed by Ansible and is intended for local development, Kubernetes practice, and CI/CD experiments.

The Ansible playbooks build:

- A 3-node Kubernetes cluster: 1 control plane and 2 workers.
- `containerd` as the Kubernetes container runtime.
- Flannel CNI using the host-only Vagrant network.
- A services VM running NFS, Docker, Gitea, and Nexus.
- Helm 3 package manager on the master node.
- Jenkins deployed inside Kubernetes via Helm with NFS-backed persistent storage.
- NGINX Ingress Controller for HTTP/HTTPS routing into the cluster.
- Ansible Vault for encrypted secret management.

## Infrastructure

| Node | Hostname | IP | CPU | RAM | Role |
|------|----------|----|-----|-----|------|
| Master | `k8s-master` | `192.168.56.10` | 2 | 4 GB | Kubernetes control plane |
| Worker 1 | `k8s-worker1` | `192.168.56.11` | 2 | 2 GB | Workload node |
| Worker 2 | `k8s-worker2` | `192.168.56.12` | 2 | 2 GB | Workload node |
| Services | `services` | `192.168.56.20` | 2 | 4 GB | Ansible runner, NFS, Docker, Gitea, Nexus |

**Stack:** Ubuntu 22.04, Kubernetes `1.29.2`, kubeadm, kubelet, kubectl, containerd, Flannel, Helm 3, Docker CE, Gitea, Nexus 3, Jenkins LTS (Helm), NGINX Ingress Controller.

## Prerequisites

- Vagrant 2.3 or newer.
- VirtualBox 7.0 or newer.
- Around 16 GB RAM available on the host.

Ansible does not need to be installed on the Windows host. The Vagrantfile installs and runs Ansible from the `services` VM.

## Provisioned Services

| Service | Where it runs | Access | Notes |
|---------|---------------|--------|-------|
| Gitea | Docker on `services` VM | `http://192.168.56.20:3000` | Self-hosted Git server |
| Gitea SSH | Docker on `services` VM | `192.168.56.20:2222` | SSH access to Git repositories |
| Nexus UI | Docker on `services` VM | `http://192.168.56.20:8081` | Artifact repository |
| Nexus Docker registry | Docker on `services` VM | `192.168.56.20:8082` | Private Docker registry endpoint |
| NFS | `services` VM | `192.168.56.20:/srv/nfs/*` | Persistent storage for Kubernetes workloads |
| Jenkins | Kubernetes namespace `jenkins` | `http://192.168.56.10:30080` | Helm release, NodePort service, NFS storage |
| Ingress Controller | Kubernetes namespace `ingress-nginx` | `http://192.168.56.10:31080` | NGINX Ingress for path/host-based routing |

## Included Applications

| Path | What it contains | Current access/ports | Notes |
|------|------------------|----------------------|-------|
| `apps/todo` | Frontend, Express API, PostgreSQL manifests | Frontend NodePort `30081`, API NodePort `30082` | Source code lives in two Gitea repos (`admin/todo-frontend`, `admin/todo-backend`); Jenkins builds images and pushes them to Nexus; this folder holds the matching Kubernetes manifests |

The todo app stores PostgreSQL data on the NFS export `/srv/nfs/todo-postgres-data`. Its manifests reference images on the Nexus registry (`192.168.56.20:8082/todo-frontend:<tag>` and `192.168.56.20:8082/todo-backend:<tag>`). Image pulls authenticate via the `nexus-registry-creds` Secret (created automatically by the `jenkins` Ansible role) and the deployments declare it through `imagePullSecrets`.

## Project Structure

```text
k8s-project/
├── Vagrantfile
├── README.md
├── REVISION.md                       # Single-page study aid for the oral defense
├── DOCUMENTATION.md                  # Long-form technical reference (FR)
├── ansible/
│   ├── ansible.cfg                   # Ansible configuration (vault, roles path)
│   ├── .vault_pass                   # Vault password file (gitignored)
│   ├── inventory.ini
│   ├── site.yml                      # Main orchestrator — imports all playbooks
│   ├── playbook.yml                  # Backward-compatible wrapper → site.yml
│   ├── group_vars/
│   │   └── all/
│   │       ├── vars.yml              # Non-secret variables
│   │       └── vault.yml             # Encrypted secrets (ansible-vault)
│   ├── playbooks/                    # Standalone playbooks for independent execution
│   │   ├── cluster-prepare.yml       # Stage 1: common + containerd + kubernetes
│   │   ├── cluster-init.yml          # Stage 2: master init + Flannel CNI
│   │   ├── cluster-join.yml          # Stage 3: workers join cluster
│   │   ├── services-prepare.yml      # Stage 4: services VM base setup
│   │   ├── services-deploy.yml       # Stage 5: NFS + Docker + Gitea + Nexus
│   │   ├── jenkins.yml               # Stage 6: Helm + Jenkins deployment
│   │   ├── ingress.yml               # Stage 7: NGINX Ingress Controller
│   │   └── validate.yml              # Stage 8: cluster health checks
│   └── roles/
│       ├── common/                   # Swap, kernel modules, sysctl, /etc/hosts
│       ├── containerd/               # Container runtime + Nexus registry trust
│       ├── kubernetes/               # kubeadm, kubelet, kubectl installation
│       ├── master/                   # kubeadm init, kube-proxy patch, CoreDNS
│       ├── cni/                      # Flannel CNI with --iface=enp0s8
│       ├── workers/                  # kubeadm join
│       ├── nfs/                      # NFS server + exports
│       ├── docker/                   # Docker CE on services VM
│       ├── gitea/                    # Gitea Docker Compose deployment
│       ├── nexus/                    # Nexus Docker Compose deployment
│       ├── helm/                     # Helm 3 binary installation
│       ├── jenkins/                  # Jenkins via Helm chart + RBAC + NFS PV
│       └── nginx-ingress/            # NGINX Ingress Controller via Helm
├── apps/
│   └── todo/
│       ├── backend/                  # Node.js/Express API, PostgreSQL client
│       ├── frontend/                 # nginx-served static UI
│       └── k8s/                      # Namespace, Postgres, frontend, backend manifests
└── docs/
    └── kubernetes-guide-tunisien.*   # Tunisian-dialect Kubernetes learning guide
```

## Ansible Flow

The `site.yml` orchestrator imports eight standalone playbooks in sequence:

| Stage | Playbook | Targets | What it does |
|-------|----------|---------|--------------|
| 1 | `cluster-prepare.yml` | `k8s_nodes` | Disable swap, load kernel modules, configure sysctl, install containerd and Kubernetes packages |
| 2 | `cluster-init.yml` | `masters` | Initialize control plane with kubeadm, patch kube-proxy and CoreDNS, install Flannel CNI |
| 3 | `cluster-join.yml` | `workers` | Join worker nodes to the cluster |
| 4 | `services-prepare.yml` | `services` | Install base packages and populate `/etc/hosts` |
| 5 | `services-deploy.yml` | `services` | Deploy NFS server, Docker, Gitea, and Nexus |
| 6 | `jenkins.yml` | `masters` | Install Helm, deploy Jenkins via Helm chart with NFS storage |
| 7 | `ingress.yml` | `masters` | Install NGINX Ingress Controller via Helm |
| 8 | `validate.yml` | `masters` | Verify nodes, pods, Jenkins, and Ingress are healthy |

Each playbook can be run independently for targeted operations.

## Secrets Management

Sensitive variables are stored in `group_vars/all/vault.yml` and encrypted with Ansible Vault. The vault password is read from `ansible/.vault_pass` (excluded from Git).

```bash
# Encrypt the vault file (first time)
cd ansible
ansible-vault encrypt group_vars/all/vault.yml

# Edit encrypted secrets
ansible-vault edit group_vars/all/vault.yml

# View encrypted secrets
ansible-vault view group_vars/all/vault.yml
```

Non-secret variables in `vars.yml` reference vault values using Jinja2:

```yaml
# vars.yml
nexus_admin_password: "{{ vault_nexus_admin_password }}"

# vault.yml (encrypted)
vault_nexus_admin_password: "adminadmin"
```

## Important Variables

Variables are defined in `ansible/group_vars/all/vars.yml`. Each role also documents its expected variables in `defaults/main.yml`.

| Variable | Value | Purpose |
|----------|-------|---------|
| `kube_version` | `1.29.2-1.1` | Pinned Kubernetes package version |
| `kube_major_version` | `1.29` | Kubernetes apt repository branch |
| `pod_network_cidr` | `10.244.0.0/16` | Flannel pod network |
| `master_ip` | `192.168.56.10` | API server advertise address |
| `services_ip` | `192.168.56.20` | Services VM address |
| `helm_version` | `v3.14.2` | Helm binary version |
| `jenkins_namespace` | `jenkins` | Jenkins Kubernetes namespace |
| `jenkins_nodeport` | `30080` | Jenkins browser access port |
| `jenkins_nfs_path` | `/srv/nfs/jenkins-data` | Jenkins persistent storage |
| `ingress_namespace` | `ingress-nginx` | Ingress Controller namespace |
| `ingress_http_nodeport` | `31080` | Ingress HTTP entry point |

NFS exports created by Ansible:

- `/srv/nfs/mysql-data`
- `/srv/nfs/jenkins-data`
- `/srv/nfs/todo-postgres-data`

## Quick Start

### First-time provisioning

```bash
vagrant up
```

This creates the four VMs and runs the Ansible playbooks from the `services` VM.

### Boot without re-provisioning

```bash
vagrant up --no-provision
```

### Re-run all Ansible playbooks

```bash
vagrant provision services
```

Or run from the services VM:

```bash
vagrant ssh services -c "cd /home/vagrant/ansible && ansible-playbook -i inventory.ini site.yml --become -v"
```

### Run individual stages

```bash
# Re-deploy only Jenkins
vagrant ssh services -c "cd /home/vagrant/ansible && ansible-playbook -i inventory.ini playbooks/jenkins.yml --become -v"

# Re-deploy only the Ingress Controller
vagrant ssh services -c "cd /home/vagrant/ansible && ansible-playbook -i inventory.ini playbooks/ingress.yml --become -v"

# Validate the cluster
vagrant ssh services -c "cd /home/vagrant/ansible && ansible-playbook -i inventory.ini playbooks/validate.yml -v"

# Re-deploy only services VM workloads (NFS, Docker, Gitea, Nexus)
vagrant ssh services -c "cd /home/vagrant/ansible && ansible-playbook -i inventory.ini playbooks/services-deploy.yml --become -v"
```

## Verification

```bash
vagrant ssh k8s-master -c "kubectl get nodes -o wide"
vagrant ssh k8s-master -c "kubectl get pods -A -o wide"
vagrant ssh k8s-master -c "kubectl -n jenkins get pods,svc,pvc"
vagrant ssh k8s-master -c "kubectl -n ingress-nginx get pods,svc"
vagrant ssh k8s-master -c "helm list -A"
vagrant ssh services -c "docker ps"
vagrant ssh services -c "showmount -e localhost"
```

Expected state:

- `k8s-master`, `k8s-worker1`, and `k8s-worker2` are `Ready`.
- Core Kubernetes pods, Flannel pods, and kube-proxy pods are running.
- Jenkins pod is running in the `jenkins` namespace (Helm release).
- NGINX Ingress Controller pod is running in the `ingress-nginx` namespace.
- Docker on the `services` VM runs `gitea` and `nexus`.
- NFS exports include `mysql-data`, `jenkins-data`, and `todo-postgres-data`.

## Browser Access

- Gitea: `http://192.168.56.20:3000`
- Nexus: `http://192.168.56.20:8081`
- Jenkins: `http://192.168.56.10:30080`
- Ingress Controller: `http://192.168.56.10:31080`
- Todo frontend, if manually deployed: `http://192.168.56.10:30081`
- Todo API, if manually deployed: `http://192.168.56.10:30082/api/health`

## Manual Todo App Deployment Notes

The todo app is present in the repo but is not part of the Ansible playbooks.

```bash
kubectl apply -f apps/todo/k8s/namespace.yml
kubectl apply -f apps/todo/k8s/postgres.yml
kubectl apply -f apps/todo/k8s/backend.yml
kubectl apply -f apps/todo/k8s/frontend.yml
```

The backend and frontend manifests reference images on the Nexus registry (`192.168.56.20:8082/todo-backend:<tag>`, `192.168.56.20:8082/todo-frontend:<tag>`). Before the first manual apply you need either an initial Jenkins pipeline run that pushes a tag, or a one-off manual `docker build` + `docker push` against Nexus. Image pulls authenticate via the `nexus-registry-creds` Secret created in `todo-app` by the `jenkins` Ansible role.

## Manual CI/CD Setup

The infrastructure is automated, but application-specific CI/CD wiring is still manual:

1. Finish the first-run setup for Gitea, Nexus, and Jenkins.
2. Create the required Jenkins plugins and credentials.
3. Create a Gitea repository for your app.
4. Add a `Jenkinsfile` and Kubernetes manifests to that repo.
5. Configure a Jenkins Pipeline job.
6. Add a Gitea webhook pointing to Jenkins.

Useful credentials commonly created in Jenkins:

- Nexus username/password for image pushes.
- Gitea username/password or token for repository checkout.
- Kubernetes kubeconfig from `/etc/kubernetes/admin.conf` on `k8s-master`.

## Design Notes

### Why containerd on Kubernetes nodes

Kubernetes uses `containerd` directly through CRI. Docker is installed only on the `services` VM for Gitea and Nexus containers, and for local image-build experiments.

### Why Flannel uses `enp0s8`

Each Vagrant VM has a NAT interface and a host-only interface. Flannel must use the host-only `192.168.56.0/24` network, so the CNI manifest is patched with `--iface=enp0s8`.

### Why kube-proxy is patched

On Vagrant, kubeadm can generate kube-proxy configuration pointing at the NAT address. The `master` role patches kube-proxy to use `https://192.168.56.10:6443`.

### Why Jenkins uses Helm

Jenkins is deployed using the official `jenkins/jenkins` Helm chart instead of raw Kubernetes manifests. Helm provides tested defaults, upgrade paths, and reduces the maintenance surface. Infrastructure prerequisites (namespaces, RBAC, NFS PV/PVC) are applied as raw manifests before the Helm install since the chart does not manage them.

### Why Jenkins uses NFS

Jenkins runs as a Kubernetes Deployment. Its home directory is stored on an NFS-backed PersistentVolume at `/srv/nfs/jenkins-data`, so the data survives pod restarts and Helm upgrades.

### Why NGINX Ingress Controller

The Ingress Controller provides a single entry point for HTTP/HTTPS traffic into the cluster. Instead of exposing every service on its own NodePort, services can be routed through the Ingress Controller using hostname or path-based rules defined in Kubernetes Ingress resources.

### Why Ansible Vault

Sensitive credentials (e.g., Nexus admin password) are stored encrypted in `group_vars/all/vault.yml` rather than in plaintext. The vault password file (`.vault_pass`) is excluded from Git, ensuring secrets are not exposed in version control.

## Troubleshooting

### Node shows `NotReady`

```bash
vagrant ssh <node> -c "sudo systemctl restart containerd kubelet"
vagrant ssh k8s-master -c "kubectl get nodes"
```

### Gitea or Nexus is not responding

```bash
vagrant ssh services
docker ps -a
docker logs gitea
docker logs nexus
```

### Jenkins is not responding

```bash
vagrant ssh k8s-master
kubectl -n jenkins get pods,svc,pvc
kubectl -n jenkins describe pod -l app.kubernetes.io/name=jenkins
kubectl -n jenkins logs -l app.kubernetes.io/name=jenkins
helm status jenkins -n jenkins
```

### Ingress Controller is not responding

```bash
vagrant ssh k8s-master
kubectl -n ingress-nginx get pods,svc
kubectl -n ingress-nginx describe pod -l app.kubernetes.io/name=ingress-nginx
helm status ingress-nginx -n ingress-nginx
```

### Helm releases

```bash
vagrant ssh k8s-master -c "helm list -A"
```

### NFS exports are missing

```bash
vagrant ssh services -c "showmount -e localhost"
vagrant provision services
```

### Vault password issues

```bash
# Check that .vault_pass exists
cat ansible/.vault_pass

# Decrypt the vault file manually
cd ansible && ansible-vault decrypt group_vars/all/vault.yml
```

## Further Reading

- Full Kubernetes guide in Tunisian dialect: [docs/kubernetes-guide-tunisien.pdf](docs/kubernetes-guide-tunisien.pdf)
- Official Kubernetes docs: https://kubernetes.io/docs/
- Jenkins Helm chart: https://github.com/jenkinsci/helm-charts
- NGINX Ingress Controller: https://kubernetes.github.io/ingress-nginx/
- Ansible Vault docs: https://docs.ansible.com/ansible/latest/vault_guide/
- Jenkins Pipeline syntax: https://www.jenkins.io/doc/book/pipeline/syntax/
- Gitea webhook docs: https://docs.gitea.com/usage/webhooks
