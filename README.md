# Kubernetes Cluster — Local DevOps Lab

## Overview

This project provisions a local, Vagrant-based Kubernetes lab with a supporting services VM. The infrastructure is managed by Ansible and is intended for local development, Kubernetes practice, and CI/CD experiments.

The current Ansible playbook builds:

- A 3-node Kubernetes cluster: 1 control plane and 2 workers.
- `containerd` as the Kubernetes container runtime.
- Flannel CNI using the host-only Vagrant network.
- A services VM running NFS, Docker, Gitea, and Nexus.
- Jenkins deployed inside Kubernetes with persistent storage backed by NFS.

## Infrastructure

| Node | Hostname | IP | CPU | RAM | Role |
|------|----------|----|-----|-----|------|
| Master | `k8s-master` | `192.168.56.10` | 2 | 4 GB | Kubernetes control plane |
| Worker 1 | `k8s-worker1` | `192.168.56.11` | 2 | 2 GB | Workload node |
| Worker 2 | `k8s-worker2` | `192.168.56.12` | 2 | 2 GB | Workload node |
| Services | `services` | `192.168.56.20` | 2 | 4 GB | Ansible runner, NFS, Docker, Gitea, Nexus |

**Stack:** Ubuntu 22.04, Kubernetes `1.29.2`, kubeadm, kubelet, kubectl, containerd, Flannel, Docker CE, Gitea, Nexus 3, Jenkins LTS.

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
| Jenkins | Kubernetes namespace `jenkins` | `http://192.168.56.10:30080` | NodePort service backed by NFS storage |

## Included Applications

| Path | What it contains | Current access/ports | Notes |
|------|------------------|----------------------|-------|
| `apps/todo` | Frontend, Express API, PostgreSQL manifests | Frontend NodePort `30081`, API NodePort `30082` | Example app, not deployed by Ansible |
| `k8s-apps/hello-world` | nginx Deployment using a ConfigMap for HTML | NodePort `30080` | Conflicts with Jenkins unless the port is changed |
| `k8s-apps/hello-world-v2` | nginx Deployment using image `192.168.56.20:8082/hello-world:1` | NodePort `30080` | Also conflicts with Jenkins unless the port is changed |

The todo app stores PostgreSQL data on the NFS export `/srv/nfs/todo-postgres-data`. Its Kubernetes manifests use local images named `todo-frontend:local` and `todo-backend:local` with `imagePullPolicy: Never`, so those images must exist in the target node runtime or be changed to images pushed to Nexus.

## Project Structure

```text
k8s-project/
├── Vagrantfile
├── README.md
├── DOCUMENTATION.md
├── ansible/
│   ├── inventory.ini
│   ├── playbook.yml
│   ├── group_vars/
│   │   └── all.yml
│   └── roles/
│       ├── common/
│       ├── containerd/
│       ├── kubernetes/
│       ├── master/
│       ├── workers/
│       ├── cni/
│       ├── nfs/
│       ├── docker/
│       ├── gitea/
│       ├── nexus/
│       └── jenkins/
├── apps/
│   └── todo/
│       ├── backend/                  # Node.js/Express API, PostgreSQL client
│       ├── frontend/                 # nginx-served static UI
│       └── k8s/                      # Namespace, Postgres, frontend, backend manifests
├── docs/
│   └── kubernetes-guide-tunisien.*
└── k8s-apps/
    ├── hello-world/                  # ConfigMap-backed nginx example
    └── hello-world-v2/               # Nexus image-backed nginx example
```

## Ansible Flow

The main playbook runs these stages:

1. Prepare Kubernetes nodes with swap disabled, kernel modules, sysctl settings, common packages, and `/etc/hosts` entries.
2. Install and configure `containerd` on Kubernetes nodes.
3. Install pinned Kubernetes packages: `kubelet`, `kubeadm`, and `kubectl` version `1.29.2-1.1`.
4. Initialize the control plane on `k8s-master`.
5. Patch kube-proxy to use the host-only master IP.
6. Install Flannel CNI and force `--iface=enp0s8`.
7. Join `k8s-worker1` and `k8s-worker2` to the cluster.
8. Prepare the `services` VM.
9. Deploy NFS, Docker, Gitea, and Nexus on the `services` VM.
10. Deploy Jenkins inside Kubernetes.
11. Validate nodes, pods, and Jenkins resources.

## Important Variables

| Variable | Value | Purpose |
|----------|-------|---------|
| `kube_version` | `1.29.2-1.1` | Pinned Kubernetes package version |
| `kube_major_version` | `1.29` | Kubernetes apt repository branch |
| `pod_network_cidr` | `10.244.0.0/16` | Flannel pod network |
| `master_ip` | `192.168.56.10` | API server advertise address |
| `services_ip` | `192.168.56.20` | Services VM address |
| `jenkins_namespace` | `jenkins` | Jenkins Kubernetes namespace |
| `jenkins_nodeport` | `30080` | Jenkins browser access port |
| `jenkins_nfs_path` | `/srv/nfs/jenkins-data` | Jenkins persistent storage |

NFS exports created by Ansible:

- `/srv/nfs/mysql-data`
- `/srv/nfs/jenkins-data`
- `/srv/nfs/todo-postgres-data`

## Quick Start

### First-time provisioning

```bash
vagrant up
```

This creates the four VMs and runs the Ansible playbook from the `services` VM.

### Boot without re-provisioning

```bash
vagrant up --no-provision
```

### Re-run Ansible

```bash
vagrant provision services
```

Or run it from the services VM:

```bash
vagrant ssh services -c "cd /home/vagrant/ansible && ANSIBLE_HOST_KEY_CHECKING=false ansible-playbook -i inventory.ini playbook.yml --become -v"
```

## Verification

```bash
vagrant ssh k8s-master -c "kubectl get nodes -o wide"
vagrant ssh k8s-master -c "kubectl get pods -A -o wide"
vagrant ssh k8s-master -c "kubectl -n jenkins get pods,svc,pvc"
vagrant ssh services -c "docker ps"
vagrant ssh services -c "showmount -e localhost"
```

Expected state:

- `k8s-master`, `k8s-worker1`, and `k8s-worker2` are `Ready`.
- Core Kubernetes pods, Flannel pods, and kube-proxy pods are running.
- Jenkins pod is running in the `jenkins` namespace.
- Docker on the `services` VM runs `gitea` and `nexus`.
- NFS exports include `mysql-data`, `jenkins-data`, and `todo-postgres-data`.

## Browser Access

- Gitea: `http://192.168.56.20:3000`
- Nexus: `http://192.168.56.20:8081`
- Jenkins: `http://192.168.56.10:30080`
- Todo frontend, if manually deployed: `http://192.168.56.10:30081`
- Todo API, if manually deployed: `http://192.168.56.10:30082/api/health`

Note: the sample `k8s-apps/hello-world` services also use NodePort `30080`. With the current Ansible setup, that port belongs to Jenkins, so change the sample service NodePort before applying it to the cluster.

## Manual Todo App Deployment Notes

The todo app is present in the repo but is not part of `ansible/playbook.yml`.

```bash
kubectl apply -f apps/todo/k8s/namespace.yml
kubectl apply -f apps/todo/k8s/postgres.yml
kubectl apply -f apps/todo/k8s/backend.yml
kubectl apply -f apps/todo/k8s/frontend.yml
```

Before applying the backend and frontend manifests, either build/import the `todo-backend:local` and `todo-frontend:local` images into the Kubernetes node runtime, or change the manifest images to tags pushed to the Nexus Docker registry.

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

### Why Jenkins uses NFS

Jenkins runs as a Kubernetes Deployment. Its home directory is stored on an NFS-backed PersistentVolume at `/srv/nfs/jenkins-data`, so the data survives pod restarts.

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
kubectl -n jenkins describe pod -l app=jenkins
kubectl -n jenkins logs deploy/jenkins
```

### NFS exports are missing

```bash
vagrant ssh services -c "showmount -e localhost"
vagrant provision services
```

## Further Reading

- Full Kubernetes guide in Tunisian dialect: [docs/kubernetes-guide-tunisien.pdf](docs/kubernetes-guide-tunisien.pdf)
- Official Kubernetes docs: https://kubernetes.io/docs/
- Jenkins Pipeline syntax: https://www.jenkins.io/doc/book/pipeline/syntax/
- Gitea webhook docs: https://docs.gitea.com/usage/webhooks
