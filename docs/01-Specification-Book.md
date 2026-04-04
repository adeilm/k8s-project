# Specification Book — Automated Kubernetes Cluster with Vagrant & Ansible

---

## 1. Project Overview

### 1.1 Title
**Automated Deployment of a Local Kubernetes Cluster using Vagrant and Ansible**

### 1.2 Objective
The goal of this project is to design and implement a fully automated local Kubernetes cluster that can be provisioned from scratch with a single command (`vagrant up`). The student will learn how to:

- Create and manage virtual machines using **Vagrant** and **VirtualBox**
- Automate server configuration using **Ansible** (Infrastructure-as-Code)
- Install, initialize, and operate a **Kubernetes** cluster using **kubeadm**
- Understand container runtimes, networking, and cluster architecture

### 1.3 Context
Kubernetes is the industry-standard platform for container orchestration. In production environments, clusters are typically managed by cloud providers (EKS, GKE, AKS). However, understanding how to build a cluster **from scratch** is essential for any DevOps or Cloud engineer. This project gives the student hands-on experience with the underlying infrastructure that cloud-managed services abstract away.

### 1.4 Target Audience
Beginner to intermediate students in Computer Science, Cloud Computing, or DevOps engineering. No prior Kubernetes experience is required. Basic familiarity with Linux commands and networking concepts is helpful.

---

## 2. Technologies & Tools

| Technology | Version | Role in the Project |
|---|---|---|
| **Vagrant** | >= 2.3 | Declaratively defines and provisions virtual machines |
| **VirtualBox** | >= 7.0 | Hypervisor that runs the VMs on the host machine |
| **Ansible** | >= 2.14 | Configuration management tool that automates all server setup |
| **Kubernetes** | 1.29.2 | Container orchestration platform (the subject of study) |
| **kubeadm** | 1.29.2 | Official tool to bootstrap a Kubernetes cluster |
| **kubelet** | 1.29.2 | Agent that runs on every node and manages containers |
| **kubectl** | 1.29.2 | CLI tool to interact with the Kubernetes API |
| **containerd** | Latest | Container runtime (replaces Docker as the CRI backend) |
| **Flannel** | Latest | Container Network Interface (CNI) plugin for pod networking |
| **Docker CE** | Latest | Container engine on the services VM (runs Gitea, Nexus, Jenkins) |
| **Gitea** | Latest | Self-hosted Git server for source code management |
| **Nexus 3** | Latest | Private Docker image registry and artifact repository |
| **Jenkins LTS** | Latest | CI/CD automation server |
| **NFS** | Kernel server | Network file system for Kubernetes persistent storage |
| **Ubuntu** | 22.04 LTS | Operating system for all virtual machines |

---

## 3. Architecture

### 3.1 Cluster Topology

The cluster consists of **4 virtual machines** connected via a private host-only network:

```
+---------------------------------------------+
|              Host Machine                    |
|         (Windows / macOS / Linux)            |
|                                              |
|  +----------------+  +----------------+      |
|  |  k8s-master    |  |  k8s-worker1   |      |
|  |  192.168.56.10 |  |  192.168.56.11 |      |
|  |  2 vCPU / 4 GB |  |  2 vCPU / 2 GB |      |
|  |  Control Plane  |  |  Worker Node   |      |
|  +----------------+  +----------------+      |
|                                              |
|  +----------------+  +----------------+      |
|  |  k8s-worker2   |  |  services      |      |
|  |  192.168.56.12 |  |  192.168.56.20 |      |
|  |  2 vCPU / 2 GB |  |  2 vCPU / 4 GB |      |
|  |  Worker Node   |  |  NFS/Gitea/    |      |
|  |                |  |  Nexus/Jenkins |      |
|  +----------------+  +----------------+      |
|                                              |
|         Private Network: 192.168.56.0/24     |
+---------------------------------------------+
```

### 3.2 Node Roles

| Node | Hostname | IP Address | CPU | RAM | Role |
|---|---|---|---|---|---|
| Master | `k8s-master` | 192.168.56.10 | 2 | 4 GB | Kubernetes Control Plane (API Server, etcd, Scheduler, Controller Manager) |
| Worker 1 | `k8s-worker1` | 192.168.56.11 | 2 | 2 GB | Runs application workloads (pods) |
| Worker 2 | `k8s-worker2` | 192.168.56.12 | 2 | 2 GB | Runs application workloads (pods) |
| Services | `services` | 192.168.56.20 | 2 | 4 GB | Administration VM — runs Ansible, NFS, Docker, Gitea, Nexus, Jenkins. **Not part of the K8s cluster.** |

### 3.3 Network Design

- **Host-Only Network** (`192.168.56.0/24`): Private network for inter-VM communication. Not accessible from the internet.
- **NAT Network**: Automatically added by VirtualBox. Allows VMs to reach the internet (for package downloads).
- **Pod Network** (`10.244.0.0/16`): Virtual overlay network managed by Flannel. Enables pod-to-pod communication across all nodes.

### 3.4 Control Plane Components (on k8s-master)

| Component | Purpose |
|---|---|
| **kube-apiserver** | Front-end for the Kubernetes control plane. All `kubectl` commands go here. |
| **etcd** | Key-value store that holds all cluster state and configuration. |
| **kube-scheduler** | Decides which node should run a newly created pod. |
| **kube-controller-manager** | Runs background control loops (e.g., ensuring desired replica count). |
| **CoreDNS** | Provides DNS-based service discovery inside the cluster. |

### 3.5 Worker Node Components (on k8s-worker1, k8s-worker2)

| Component | Purpose |
|---|---|
| **kubelet** | Agent on each node. Receives instructions from the API server and manages containers. |
| **kube-proxy** | Maintains network rules for Service-based routing on each node. |
| **containerd** | Container runtime that actually pulls images and runs containers. |

---

## 4. Project Structure

```
k8s-project/
├── Vagrantfile                        # VM definitions & provisioning trigger
├── ansible/
│   ├── playbook.yml                   # Main orchestration (6 plays)
│   ├── inventory.ini                  # Host groups & SSH configuration
│   ├── group_vars/
│   │   └── all.yml                    # Shared variables (versions, IPs, services)
│   └── roles/
│       ├── common/                    # System prerequisites (K8s nodes)
│       │   ├── tasks/main.yml
│       │   └── handlers/main.yml
│       ├── containerd/                # Container runtime (K8s nodes)
│       │   ├── tasks/main.yml
│       │   └── handlers/main.yml
│       ├── kubernetes/                # kubeadm, kubelet, kubectl packages
│       │   └── tasks/main.yml
│       ├── master/                    # Control plane initialization
│       │   └── tasks/main.yml
│       ├── workers/                   # Worker node join
│       │   └── tasks/main.yml
│       ├── cni/                       # Flannel network plugin
│       │   └── tasks/main.yml
│       ├── nfs/                       # NFS server (services VM)
│       │   ├── tasks/main.yml
│       │   └── handlers/main.yml
│       ├── docker/                    # Docker CE (services VM)
│       │   └── tasks/main.yml
│       ├── gitea/                     # Gitea Git server (services VM)
│       │   ├── tasks/main.yml
│       │   └── templates/docker-compose.yml.j2
│       ├── nexus/                     # Nexus Docker registry (services VM)
│       │   ├── tasks/main.yml
│       │   └── templates/docker-compose.yml.j2
│       └── jenkins/                   # Jenkins CI/CD (services VM)
│           ├── tasks/main.yml
│           └── templates/docker-compose.yml.j2
└── docs/                              # Documentation (md, docx, pdf)
```

---

## 5. Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| FR-01 | Single-command provisioning | The entire cluster must be created by running `vagrant up` |
| FR-02 | Automated configuration | All node setup must be handled by Ansible (no manual SSH) |
| FR-03 | Working Kubernetes cluster | `kubectl get nodes` must show all 3 K8s nodes as `Ready` |
| FR-04 | Pod networking | Pods must be able to communicate across different nodes |
| FR-05 | Idempotent provisioning | Running `vagrant provision` again must not break the cluster |
| FR-06 | Cross-platform support | Must work on Windows, macOS, and Linux hosts |
| FR-07 | Version pinning | Kubernetes packages must be pinned to prevent version drift |

---

## 6. Non-Functional Requirements

| ID | Requirement | Description |
|---|---|---|
| NFR-01 | Reproducibility | Any student must be able to reproduce the same cluster on their machine |
| NFR-02 | Resource efficiency | VMs use minimal resources (2 GB for workers, 4 GB for master) |
| NFR-03 | Documentation | Every role and task must be clearly commented |
| NFR-04 | Security | Swap is disabled, proper sysctl parameters are set |

---

## 7. Prerequisites (What the Student Needs)

### 7.1 Hardware
- **CPU**: 4+ cores recommended (8 preferred)
- **RAM**: 16 GB minimum (the 4 VMs use 12 GB total)
- **Disk**: 40 GB free space

### 7.2 Software to Install
1. **VirtualBox** (>= 7.0) — [https://www.virtualbox.org/](https://www.virtualbox.org/)
2. **Vagrant** (>= 2.3) — [https://www.vagrantup.com/](https://www.vagrantup.com/)
3. **Git** — to clone the project repository

### 7.3 Knowledge Prerequisites
- Basic Linux command line (ls, cd, cat, nano/vim)
- Basic understanding of networking (IP addresses, ports)
- What a virtual machine is
- No Kubernetes knowledge required (this project teaches it)

---

## 8. Expected Deliverables

After completing the project, the student should have:

1. A **working 3-node Kubernetes cluster** (1 master + 2 workers)
2. A **services VM** running NFS, Gitea, Nexus, and Jenkins
3. The ability to run `kubectl get nodes` and see all nodes `Ready`
4. The ability to deploy a sample application (e.g., Nginx) to the cluster
5. A **CI/CD pipeline** ready for use:
   - **Gitea** at `http://192.168.56.20:3000` for source code management
   - **Nexus** at `http://192.168.56.20:8081` as a private Docker registry
   - **Jenkins** at `http://192.168.56.20:8080` for CI/CD automation
   - **NFS** at `192.168.56.20:/srv/nfs/*` for Kubernetes persistent storage
6. A solid understanding of:
   - How Kubernetes clusters are bootstrapped
   - The role of each component (kubelet, API server, etcd, etc.)
   - How pod networking works (Flannel overlay)
   - Infrastructure-as-Code principles (Vagrant + Ansible)
   - How CI/CD services integrate with Kubernetes

---

## 9. Provisioning Flow Summary

```
vagrant up
    |
    v
[1] Vagrant creates 4 VMs (VirtualBox)
    |
    v
[2] Services VM receives ansible/ directory + SSH key
    |
    v
[3] Ansible is installed on services VM (via pip)
    |
    v
[4] Ansible playbook runs against all nodes:
    |
    +---> Play 1: Prepare K8s nodes (common + containerd + kubernetes)
    |         - Disable swap, load kernel modules, set sysctl
    |         - Install containerd, enable SystemdCgroup
    |         - Add K8s repo, install kubeadm/kubelet/kubectl
    |
    +---> Play 2: Initialize control plane (master + cni)
    |         - kubeadm init on master
    |         - Configure kubectl, generate join token
    |         - Deploy Flannel CNI
    |
    +---> Play 3: Join workers
    |         - Each worker runs kubeadm join with dynamic token
    |
    +---> Play 4: Prepare services VM
    |         - Install base packages, /etc/hosts
    |
    +---> Play 5: Deploy services (NFS, Docker, Gitea, Nexus, Jenkins)
    |         - Install NFS server, configure exports
    |         - Install Docker CE from official repo
    |         - Deploy Gitea (Git server — port 3000)
    |         - Deploy Nexus (Docker registry — port 8081/8082)
    |         - Deploy Jenkins (CI/CD — port 8080)
    |
    +---> Play 6: Validate cluster
              - Wait for all nodes Ready
              - Display kubectl get nodes / pods
```

---

## 10. Key Design Decisions

| Decision | Rationale |
|---|---|
| Ansible runs from the services VM, not the host | Ensures cross-platform compatibility (Windows has no native Ansible) |
| containerd instead of Docker | Docker is deprecated as a K8s runtime since v1.24. containerd is the standard. |
| Flannel for CNI | Simplest CNI plugin, ideal for learning. Production would use Calico or Cilium. |
| Kubernetes 1.29.2 pinned | Prevents version mismatches between nodes. Ensures reproducibility. |
| Services VM separate from cluster | Keeps administration tools isolated. Mirrors real-world infrastructure patterns. |
| Docker Compose for services | Each service (Gitea, Nexus, Jenkins) runs as a container managed by Docker Compose. Simple to deploy, update, and restart. |
| NFS for persistent storage | Provides shared storage that Kubernetes PersistentVolumes can mount across nodes. |
| Insecure Vagrant SSH key | Simplifies inter-VM SSH for a local development environment. Not for production. |
