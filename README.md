# Kubernetes Cluster — Local Development Environment

## Overview

Fully automated Kubernetes cluster provisioned locally using **Vagrant** and **Ansible**.

| Node | Hostname | IP | CPU | RAM | Role |
|------|----------|----|-----|-----|------|
| Master | k8s-master | 192.168.56.10 | 2 | 4 GB | Control plane |
| Worker 1 | k8s-worker1 | 192.168.56.11 | 2 | 2 GB | Workload node |
| Worker 2 | k8s-worker2 | 192.168.56.12 | 2 | 2 GB | Workload node |
| Services | services | 192.168.56.20 | 2 | 4 GB | NFS, Gitea, Nexus, Ansible |

**Stack:** Ubuntu 22.04 · Kubernetes 1.29.2 · containerd · Flannel CNI · kubeadm · Docker CE · Gitea · Nexus 3 · Jenkins LTS on Kubernetes

---

## Prerequisites

Install the following on your host machine:

- [Vagrant](https://www.vagrantup.com/downloads) (>= 2.3)
- [VirtualBox](https://www.virtualbox.org/wiki/Downloads) (>= 7.0)
- [Ansible](https://docs.ansible.com/ansible/latest/installation_guide/) (>= 2.14)

> **Windows users:** Ansible runs on the host via Vagrant's Ansible provisioner.
> Ensure Ansible is accessible from your terminal (WSL or Git Bash recommended).

---

## Project Structure

```
cluster/
├── Vagrantfile                          # VM definitions & Ansible provisioner
├── docs/                                # Project documentation (md, docx, pdf)
├── apps/
│   └── todo/                            # Simple demo app (frontend, backend, k8s)
├── ansible/
│   ├── inventory.ini                    # Static inventory with groups
│   ├── group_vars/
│   │   └── all.yml                      # Shared variables (versions, IPs, services)
│   ├── roles/
│   │   ├── common/                      # Swap, kernel modules, sysctl, packages
│   │   ├── containerd/                  # Container runtime
│   │   ├── kubernetes/                  # kubeadm, kubelet, kubectl
│   │   ├── master/                      # Control plane init + join command
│   │   ├── workers/                     # Worker join
│   │   ├── cni/                         # Flannel deployment
│   │   ├── nfs/                         # NFS server (services VM)
│   │   ├── docker/                      # Docker CE (services VM)
│   │   ├── gitea/                       # Gitea Git server (services VM)
│   │   ├── nexus/                       # Nexus Docker registry (services VM)
│   │   └── jenkins/                     # Jenkins CI/CD (deployed in Kubernetes)
│   └── playbook.yml                     # Main playbook (execution order)
└── README.md                            # This file
```

---

## Quick Start

### 1. Provision the entire cluster

```bash
vagrant up
```

This single command will:
1. Create 4 Ubuntu 22.04 VMs in VirtualBox
2. Run the Ansible playbook automatically after all VMs are ready
3. Initialize the Kubernetes control plane on `k8s-master`
4. Join `k8s-worker1` and `k8s-worker2` to the cluster
5. Deploy the Flannel CNI plugin
6. Deploy NFS, Docker, Gitea, and Nexus on `services`
7. Deploy Jenkins inside the Kubernetes cluster
8. Validate the cluster and display node/pod status

### 2. Access the cluster

```bash
# SSH into any node
vagrant ssh k8s-master
vagrant ssh k8s-worker1
vagrant ssh k8s-worker2
vagrant ssh services
```

### 3. Verify the cluster

```bash
vagrant ssh k8s-master -c "kubectl get nodes"
```

Expected output:
```
NAME          STATUS   ROLES           AGE   VERSION
k8s-master    Ready    control-plane   5m    v1.29.2
k8s-worker1   Ready    <none>          3m    v1.29.2
k8s-worker2   Ready    <none>          3m    v1.29.2
```

```bash
vagrant ssh k8s-master -c "kubectl get pods -A"
```

Expected pods — all `Running`:

- `coredns-*` (2 pods)
- `etcd-k8s-master`
- `kube-apiserver-k8s-master`
- `kube-controller-manager-k8s-master`
- `kube-proxy-*` (3 pods)
- `kube-scheduler-k8s-master`
- `kube-flannel-ds-*` (3 pods)

### 4. Verify the services VM

```bash
vagrant ssh services -c "docker ps"
```

Expected containers — all running: `gitea`, `nexus`

### 5. Verify Jenkins in the cluster

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins get pods,svc,pvc"
```

Expected resources:

- `pod/jenkins-*` in `Running`
- `service/jenkins` exposed on `NodePort`
- `persistentvolumeclaim/jenkins-home` in `Bound`

**Access from your browser:**

| Service | URL | Credentials |
|---------|-----|-------------|
| Gitea | http://192.168.56.20:3000 | First-run setup wizard |
| Nexus | http://192.168.56.20:8081 | admin / (see admin.password in container) |
| Jenkins | http://192.168.56.10:30080 | Initial password displayed during provisioning |

---

## Ansible Execution Flow

```
Play 1 — k8s_cluster (master + workers)
  └── common       → swap, modules, sysctl, packages, /etc/hosts
  └── containerd   → install, config, SystemdCgroup, start
  └── kubernetes   → apt repo, kubelet/kubeadm/kubectl, hold, enable

Play 2 — masters
  └── master       → kubeadm init, kubectl config, join command
  └── cni          → Flannel deployment

Play 3 — workers
  └── workers      → kubeadm join (dynamic token from master)

Play 4 — services (prepare)
  └── tasks        → apt update, common packages, /etc/hosts

Play 5 — services (deploy)
  └── nfs          → NFS server, exports for K8s PersistentVolumes
  └── docker       → Docker CE from official repo
  └── gitea        → Git server (port 3000)
  └── nexus        → Docker registry (port 8081/8082)

Play 6 — masters
  └── jenkins      → Jenkins Deployment + Service + PVC (NodePort 30080)

Play 7 — masters
  └── validation   → kubectl get nodes, kubectl get pods -A
```

---

## Management Commands

```bash
# Stop all VMs (preserving state)
vagrant halt

# Restart all VMs
vagrant up

# Re-run Ansible provisioning only
vagrant provision

# Destroy all VMs completely
vagrant destroy -f

# Check VM status
vagrant status
```

---

## Simple Todo App

The repo now includes a minimal demo application under [`apps/todo`](apps/todo):

- `frontend` — static HTML/CSS/JS served by Nginx
- `backend` — Node.js + Express REST API
- `k8s` — namespace, Postgres, backend, and frontend manifests

### Build the images

Build both images on a machine with Docker:

```bash
docker build -t todo-backend:local apps/todo/backend
docker build -t todo-frontend:local apps/todo/frontend
```

### Load the images into the cluster

Because the cluster uses `containerd`, import the images on each Kubernetes node before applying the manifests:

```bash
docker save todo-backend:local -o todo-backend.tar
docker save todo-frontend:local -o todo-frontend.tar

for node in k8s-master k8s-worker1 k8s-worker2; do
  vagrant upload todo-backend.tar /home/vagrant/todo-backend.tar "$node"
  vagrant upload todo-frontend.tar /home/vagrant/todo-frontend.tar "$node"
  vagrant ssh "$node" -c "sudo ctr -n k8s.io images import /home/vagrant/todo-backend.tar"
  vagrant ssh "$node" -c "sudo ctr -n k8s.io images import /home/vagrant/todo-frontend.tar"
done
```

### Prepare storage and deploy

If your cluster already exists, re-run provisioning once so the new NFS export for Postgres is created:

```bash
vagrant provision services
```

Deploy the app from the master node:

```bash
vagrant ssh k8s-master -c "kubectl apply -f /vagrant/apps/todo/k8s/namespace.yml"
vagrant ssh k8s-master -c "kubectl apply -f /vagrant/apps/todo/k8s/postgres.yml"
vagrant ssh k8s-master -c "kubectl apply -f /vagrant/apps/todo/k8s/backend.yml"
vagrant ssh k8s-master -c "kubectl apply -f /vagrant/apps/todo/k8s/frontend.yml"
```

### Open the app

- Frontend: `http://192.168.56.10:30081`
- Backend health: `http://192.168.56.10:30082/api/health`

### Verify persistence

Create a few tasks, then restart Postgres and confirm they are still present:

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get pods,svc,pvc"
vagrant ssh k8s-master -c "kubectl -n todo-app delete pod -l app=postgres"
```

The `todo-postgres-pvc` claim should stay `Bound`, and the tasks should still be visible after the Postgres pod comes back.

---

## Configuration

All configurable values are in [`ansible/group_vars/all.yml`](ansible/group_vars/all.yml):

| Variable | Default | Description |
|----------|---------|-------------|
| `kube_version` | `1.29.2-1.1` | Pinned Kubernetes APT package version |
| `kube_major_version` | `1.29` | Used for APT repository URL |
| `pod_network_cidr` | `10.244.0.0/16` | Pod network CIDR (Flannel default) |
| `master_ip` | `192.168.56.10` | API server advertise address |
| `flannel_manifest_url` | `...kube-flannel.yml` | Flannel deployment manifest |
| `services_ip` | `192.168.56.20` | Services VM IP |
| `gitea_http_port` | `3000` | Gitea web UI port |
| `nexus_http_port` | `8081` | Nexus web UI port |
| `nexus_docker_port` | `8082` | Nexus Docker registry port |
| `jenkins_http_port` | `8080` | Jenkins container web UI port |
| `jenkins_nodeport` | `30080` | Jenkins Kubernetes NodePort |
| `nfs_allowed_network` | `192.168.56.0/24` | Network allowed to mount NFS shares |

---

## Design Decisions

- **Idempotent tasks only** — Every role can be re-run safely without side effects
- **No manual steps** — `vagrant up` handles everything end-to-end
- **Explicit versioning** — Kubernetes packages are pinned and held
- **Dynamic join token** — Worker join command is extracted from the master at runtime
- **Ansible provisioner on last VM** — Ensures all VMs exist before any configuration begins
- **Services node separated** — Not part of the K8s cluster; runs NFS, Gitea, and Nexus via Docker while Jenkins runs in Kubernetes
- **Kubernetes-hosted Jenkins** — CI/CD now runs as an in-cluster workload exposed through a NodePort service
- **NFS for persistent storage** — Kubernetes PersistentVolumes backed by NFS exports from the services VM

---

## Troubleshooting

```bash
# Re-provision with verbose output
ANSIBLE_VERBOSITY=3 vagrant provision

# Check kubelet logs on a node
vagrant ssh k8s-master -c "sudo journalctl -u kubelet -f"

# Reset a node's Kubernetes state (use with caution)
vagrant ssh k8s-worker1 -c "sudo kubeadm reset -f"
```
