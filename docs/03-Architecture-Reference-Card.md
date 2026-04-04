# Architecture Reference Card — Kubernetes Cluster

> Single-page cheat sheet. Print it, pin it, refer to it.

---

## Cluster Topology

```
┌──────────────────────────────────────────────────────────────────┐
│                        HOST MACHINE                              │
│                  (Windows / macOS / Linux)                        │
│                                                                  │
│    ┌───────────────────────── Kubernetes Cluster ──────────────┐  │
│    │                                                           │  │
│    │  ┌─────────────────┐  ┌──────────────┐  ┌──────────────┐ │  │
│    │  │   k8s-master    │  │ k8s-worker1  │  │ k8s-worker2  │ │  │
│    │  │ 192.168.56.10   │  │192.168.56.11 │  │192.168.56.12 │ │  │
│    │  │ 2 CPU / 4 GB    │  │ 2 CPU / 2 GB │  │ 2 CPU / 2 GB │ │  │
│    │  │                 │  │              │  │              │ │  │
│    │  │ API Server      │  │ kubelet      │  │ kubelet      │ │  │
│    │  │ etcd            │  │ kube-proxy   │  │ kube-proxy   │ │  │
│    │  │ Scheduler       │  │ containerd   │  │ containerd   │ │  │
│    │  │ Controller Mgr  │  │ flannel      │  │ flannel      │ │  │
│    │  │ CoreDNS         │  │              │  │              │ │  │
│    │  │ kubelet         │  │ [Your Pods]  │  │ [Your Pods]  │ │  │
│    │  │ kube-proxy      │  │              │  │              │ │  │
│    │  │ containerd      │  │              │  │              │ │  │
│    │  │ flannel         │  │              │  │              │ │  │
│    │  └─────────────────┘  └──────────────┘  └──────────────┘ │  │
│    │                                                           │  │
│    └───────────────────────────────────────────────────────────┘  │
│                                                                  │
│    ┌─────────────────┐                                           │
│    │    services      │  NOT in Kubernetes cluster                │
│    │ 192.168.56.20   │  NFS · Docker · Gitea · Nexus · Jenkins   │
│    │ 2 CPU / 4 GB    │  Ansible control node                     │
│    └─────────────────┘                                           │
│                                                                  │
│    Network: 192.168.56.0/24 (host-only)                          │
│    Pod CIDR: 10.244.0.0/16 (Flannel overlay)                     │
└──────────────────────────────────────────────────────────────────┘
```

---

## IP Address Map

| Hostname | IP Address | Role | CPU | RAM |
|---|---|---|---|---|
| `k8s-master` | `192.168.56.10` | Control Plane | 2 | 4 GB |
| `k8s-worker1` | `192.168.56.11` | Worker Node | 2 | 2 GB |
| `k8s-worker2` | `192.168.56.12` | Worker Node | 2 | 2 GB |
| `services` | `192.168.56.20` | NFS, Gitea, Nexus, Jenkins | 2 | 4 GB |

---

## Networks

| Network | CIDR | Purpose |
|---|---|---|
| Host-Only | `192.168.56.0/24` | VM-to-VM and host-to-VM communication |
| NAT | `10.0.2.0/24` | VM internet access (outbound only) |
| Pod Network | `10.244.0.0/16` | Pod-to-pod communication (Flannel overlay) |
| Service Network | `10.96.0.0/12` | Kubernetes Service ClusterIPs (default) |

---

## Network Interfaces (inside VMs)

| Interface | Network | Used By |
|---|---|---|
| `enp0s3` | NAT (10.0.2.15) | Internet access |
| `enp0s8` | Host-Only (192.168.56.x) | Cluster communication, Flannel |

---

## Control Plane Components (k8s-master)

| Component | Port | Purpose |
|---|---|---|
| `kube-apiserver` | 6443 | REST API front-end for the cluster |
| `etcd` | 2379-2380 | Cluster state database |
| `kube-scheduler` | 10259 | Assigns pods to nodes |
| `kube-controller-manager` | 10257 | Runs control loops (replication, endpoints, etc.) |
| `CoreDNS` | 53 | DNS-based service discovery (cluster.local) |

## Worker Node Components (all nodes)

| Component | Purpose |
|---|---|
| `kubelet` | Manages pod lifecycle on the node |
| `kube-proxy` | Maintains iptables rules for Service routing |
| `containerd` | Container runtime (pulls images, runs containers) |
| `flannel` | Overlay network agent (routes pod traffic) |

---

## Software Versions

| Software | Version |
|---|---|
| Ubuntu | 22.04 LTS (Jammy) |
| Kubernetes | 1.29.2 |
| containerd | Latest (Ubuntu repo) |
| Flannel | Latest (GitHub release) |
| Ansible | Latest (pip) |
| Docker CE | Latest (official repo) |
| Gitea | Latest (Docker image) |
| Nexus 3 | Latest (Docker image) |
| Jenkins | LTS (Docker image) |

---

## Services VM (192.168.56.20)

| Service | Port | URL | Purpose |
|---|---|---|---|
| NFS | 2049 | — | Persistent storage for K8s PVs |
| Gitea | 3000 (HTTP), 2222 (SSH) | `http://192.168.56.20:3000` | Git server |
| Nexus | 8081 (HTTP), 8082 (Docker) | `http://192.168.56.20:8081` | Docker image registry |
| Jenkins | 8080 | `http://192.168.56.20:8080` | CI/CD automation |

---

## Key Files

| File | Purpose |
|---|---|
| `Vagrantfile` | VM definitions + provisioning trigger |
| `ansible/playbook.yml` | 6-play orchestration |
| `ansible/inventory.ini` | Host groups + SSH config |
| `ansible/group_vars/all.yml` | Shared variables |
| `ansible/roles/common/tasks/main.yml` | Swap, modules, sysctl, packages, /etc/hosts |
| `ansible/roles/containerd/tasks/main.yml` | Install + configure containerd |
| `ansible/roles/kubernetes/tasks/main.yml` | K8s packages + GPG key + APT repo |
| `ansible/roles/master/tasks/main.yml` | kubeadm init + kubectl config + join token |
| `ansible/roles/workers/tasks/main.yml` | kubeadm join (dynamic token from master) |
| `ansible/roles/cni/tasks/main.yml` | Flannel deploy + interface patch |
| `ansible/roles/nfs/tasks/main.yml` | NFS server + exports |
| `ansible/roles/docker/tasks/main.yml` | Docker CE installation |
| `ansible/roles/gitea/tasks/main.yml` | Gitea container deployment |
| `ansible/roles/nexus/tasks/main.yml` | Nexus container deployment |
| `ansible/roles/jenkins/tasks/main.yml` | Jenkins container deployment |

---

## Ansible Execution Order

```
Play 1: k8s_nodes  →  common → containerd → kubernetes
Play 2: masters    →  master → cni
Play 3: workers    →  workers
Play 4: services   →  base packages, /etc/hosts
Play 5: services   →  nfs → docker → gitea → nexus → jenkins
Play 6: masters    →  validate (kubectl get nodes/pods)
```

---

## Essential kubectl Commands

```bash
# Cluster status
kubectl get nodes -o wide              # List nodes with IPs
kubectl get pods -A -o wide            # All pods, all namespaces
kubectl cluster-info                   # API server endpoint

# Deployments
kubectl create deployment nginx --image=nginx --replicas=3
kubectl get deployments
kubectl scale deployment nginx --replicas=5
kubectl delete deployment nginx

# Services
kubectl expose deployment nginx --port=80 --type=NodePort
kubectl get svc
kubectl delete svc nginx

# Debugging
kubectl describe node k8s-worker1      # Node details
kubectl describe pod <pod-name>        # Pod details
kubectl logs <pod-name>                # Container logs
kubectl exec -it <pod-name> -- bash    # Shell into container

# Namespaces
kubectl get namespaces
kubectl get pods -n kube-system        # System pods
kubectl get pods -n kube-flannel       # Flannel pods
```

---

## Vagrant Commands

```bash
vagrant up                 # Create and provision all VMs
vagrant halt               # Stop all VMs (preserves data)
vagrant destroy -f         # Delete all VMs
vagrant ssh k8s-master     # SSH into master node
vagrant ssh k8s-worker1    # SSH into worker 1
vagrant ssh services       # SSH into services VM
vagrant status             # Show VM states
vagrant provision          # Re-run provisioning
```

---

## Troubleshooting Quick Reference

| Symptom | Check | Fix |
|---|---|---|
| Node `NotReady` | `kubectl describe node <name>` | Check Flannel pods, kubelet logs |
| Pod `Pending` | `kubectl describe pod <name>` | Check resources, node capacity |
| Pod `CrashLoopBackOff` | `kubectl logs <pod>` | Fix application error |
| Can't reach service | `kubectl get svc` + `kubectl get endpoints` | Verify pod labels match selector |
| Flannel pods failing | `kubectl logs -n kube-flannel <pod>` | Check `--iface=enp0s8` patch |
| kubelet not starting | `journalctl -u kubelet -f` on the node | Check swap disabled, containerd running |
| Gitea/Nexus/Jenkins down | `vagrant ssh services -c "docker ps -a"` | `cd /opt/<service> && docker compose up -d` |
| NFS mount failing | `showmount -e 192.168.56.20` | Check nfs-kernel-server running, exports configured |
