# PRESENTATION PREPARATION DOCUMENT
## Kubernetes Software Factory Platform - Final Review

---

## 📋 FILES TO CLEAN UP BEFORE PRESENTATION

### Recommended Deletions:

1. **docs/kubernetes-guide-tunisien.*** (LaTeX build artifacts)
   - Delete: `.aux`, `.fdb_latexmk`, `.log`, `.out`, `.toc`
   - Keep: `.tex` and `.pdf` only
   - **Why**: Build artifacts clutter the project

2. **.claude/** folder
   - **Why**: IDE-specific settings, not part of deliverable

3. **JENKINS_KANIKO_MIGRATION.md**
   - **Why**: Internal migration notes, not relevant for presentation

### Keep These Files:
- `README.md` - Main documentation
- `DOCUMENTATION.md` - Detailed French documentation  
- `Vagrantfile` - Infrastructure definition
- `ansible/` - All automation code
- `apps/` - Application code
- `.gitignore`, `.gitattributes` - Git configuration
- `.kubeconfig-for-jenkins` - Jenkins Kubernetes access

---

## 🏗️ YOUR CURRENT ARCHITECTURE

### Infrastructure Overview:

```
┌─────────────────────────────────────────────────────────────────┐
│                    HOST MACHINE (Windows)                        │
│                                                                  │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │              VirtualBox + Vagrant                           │ │
│  │                                                             │ │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐    │ │
│  │  │ k8s-master   │  │ k8s-worker1  │  │ k8s-worker2  │    │ │
│  │  │ .56.10       │  │ .56.11       │  │ .56.12       │    │ │
│  │  │ 2CPU/4GB     │  │ 2CPU/2GB     │  │ 2CPU/2GB     │    │ │
│  │  │              │  │              │  │              │    │ │
│  │  │ • API Server │  │ • kubelet    │  │ • kubelet    │    │ │
│  │  │ • etcd       │  │ • Pods       │  │ • Pods       │    │ │
│  │  │ • Scheduler  │  │              │  │              │    │ │
│  │  │ • Controller │  │              │  │              │    │ │
│  │  │ • Jenkins    │  │              │  │              │    │ │
│  │  │   (in K8s)   │  │              │  │              │    │ │
│  │  └──────────────┘  └──────────────┘  └──────────────┘    │ │
│  │                                                             │ │
│  │  ┌──────────────────────────────────────────────────────┐ │ │
│  │  │ services (192.168.56.20) 2CPU/4GB                    │ │ │
│  │  │ • Gitea (port 3000) - Git server                     │ │ │
│  │  │ • Nexus (port 8081/8082) - Docker registry           │ │ │
│  │  │ • NFS server - Persistent storage                    │ │ │
│  │  │   - /srv/nfs/jenkins-data                            │ │ │
│  │  │   - /srv/nfs/todo-postgres-data                      │ │ │
│  │  └──────────────────────────────────────────────────────┘ │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 4 Virtual Machines:

| VM | IP | CPU | RAM | Role |
|----|-----|-----|-----|------|
| **k8s-master** | 192.168.56.10 | 2 | 4 GB | Kubernetes control plane + Jenkins pod |
| **k8s-worker1** | 192.168.56.11 | 2 | 2 GB | Runs application pods |
| **k8s-worker2** | 192.168.56.12 | 2 | 2 GB | Runs application pods |
| **services** | 192.168.56.20 | 2 | 4 GB | Gitea, Nexus, NFS |

---

## ✅ COMPARISON WITH PROFESSOR'S REQUIREMENTS

### Required vs Implemented:

| Requirement | Status | Implementation |
|-------------|--------|----------------|
| VM Tools (Gitea, Nexus, NFS) | ✅ | On services VM (192.168.56.20) |
| Jenkins on Master Node | ✅ | Running IN Kubernetes cluster |
| Two Worker Nodes | ✅ | k8s-worker1 and k8s-worker2 |
| Frontend + Backend + Database | ✅ | Deployed in todo-app namespace |
| NFS for persistent storage | ✅ | Jenkins data + Postgres data |
| CI/CD Workflow | ✅ | Git → Jenkins → Nexus → K8s |

### Key Improvements (Bonus Points):

| Feature | Implementation | Advantage |
|---------|----------------|-----------|
| **Jenkins Location** | Inside Kubernetes (not on VM) | Cloud-native, self-healing, scalable |
| **Build Method** | Kaniko (rootless) | Secure, no Docker daemon needed |
| **RBAC** | ServiceAccount + Roles | Least-privilege security |
| **Namespaces** | jenkins + todo-app | Logical isolation |
| **Storage** | NFS-backed PVCs | Persistent, survives pod restarts |

---

## 🔄 COMPLETE CI/CD WORKFLOW

```
1. Developer writes code
   ↓
2. git push to Gitea (192.168.56.20:3000)
   ↓
3. Gitea webhook triggers Jenkins (192.168.56.10:30080)
   ↓
4. Jenkins spawns Kaniko pod in Kubernetes
   ↓
5. Kaniko builds Docker image (no Docker daemon!)
   ↓
6. Push image to Nexus registry (192.168.56.20:8082)
   ↓
7. Jenkins updates K8s deployment (kubectl set image)
   ↓
8. Kubernetes pulls image from Nexus
   ↓
9. Pods restart with new image on workers
   ↓
10. Application accessible via NodePort
    - Frontend: http://192.168.56.10:30081
    - Backend: http://192.168.56.10:30082
```

---

## 🎯 DEMO VERIFICATION COMMANDS

### 1. Check Cluster Health
```bash
vagrant status
vagrant ssh k8s-master -c "kubectl get nodes"
vagrant ssh k8s-master -c "kubectl get pods -A"
```

### 2. Check Services VM
```bash
vagrant ssh services -c "docker ps"
vagrant ssh services -c "showmount -e localhost"
```

### 3. Check Jenkins
```bash
# Access: http://192.168.56.10:30080
vagrant ssh k8s-master -c "kubectl -n jenkins exec deploy/jenkins -- cat /var/jenkins_home/secrets/initialAdminPassword"
```

### 4. Check Application
```bash
# Frontend: http://192.168.56.10:30081
curl -I http://192.168.56.10:30081/

# Backend: http://192.168.56.10:30082
curl http://192.168.56.10:30082/api/health

# Check pod distribution
vagrant ssh k8s-master -c "kubectl -n todo-app get pods -o wide"
```

### 5. Check Persistent Storage
```bash
vagrant ssh k8s-master -c "kubectl get pv,pvc -A"
```

---

## ❓ KEY PRESENTATION QUESTIONS & ANSWERS

### Q1: Why Jenkins inside Kubernetes instead of on services VM?

**Answer:**
- **Cloud-native**: Benefits from K8s features (self-healing, scaling)
- **Persistent**: NFS-backed storage survives pod restarts
- **Secure**: RBAC controls what Jenkins can do
- **Scalable**: Can spawn agent pods dynamically
- **Requirement**: Professor said "Jenkins on Master Node" - we run it IN the cluster

### Q2: What is Kaniko and why use it?

**Answer:**
- **Kaniko** builds Docker images inside Kubernetes without Docker daemon
- **Why**:
  - Docker-in-Docker requires privileged mode (security risk)
  - Kaniko runs unprivileged
  - Kubernetes-native, designed for CI/CD
- **How**: Reads Dockerfile, builds layers, pushes to registry

### Q3: Explain the CI/CD workflow

**Answer:**
1. Developer pushes code to Gitea
2. Webhook triggers Jenkins pipeline
3. Jenkins spawns Kaniko pod
4. Kaniko builds image, pushes to Nexus
5. Jenkins updates K8s deployment
6. K8s pulls new image, performs rolling update
7. Application accessible via NodePort

### Q4: Pod vs Deployment?

**Answer:**
- **Pod**: Smallest unit, runs containers. If it dies, it's gone.
- **Deployment**: Manages pod replicas, ensures desired state:
  - Auto-restarts failed pods
  - Rolling updates
  - Scaling
  - Rollback capability

### Q5: Why NFS? Why not local storage?

**Answer:**
- **Local storage problems**:
  - Tied to one node
  - Data lost if pod moves
  - Can't share between pods
- **NFS advantages**:
  - ReadWriteMany access
  - Centralized, survives failures
  - Used for Jenkins home and Postgres data

### Q6: What is a Kubernetes Service?

**Answer:**
- **Problem**: Pod IPs change on restart
- **Solution**: Service provides stable virtual IP
- **Types**:
  - ClusterIP: Internal only (postgres)
  - NodePort: Exposed on all nodes (frontend, backend, jenkins)
  - LoadBalancer: Cloud provider (not used)

### Q7: What is RBAC?

**Answer:**
- **RBAC** = Role-Based Access Control
- **Implementation**:
  - ServiceAccount: `jenkins` (identity)
  - Role in `jenkins` namespace: Create/delete pods
  - Role in `todo-app` namespace: Update deployments
  - RoleBinding: Links account to roles
- **Benefit**: Least-privilege, Jenkins can't access other namespaces

### Q8: What if master node fails?

**Answer:**
- **Current**: Single point of failure
- **Impact**:
  - Can't create/update resources (API down)
  - Existing pods keep running (kubelet autonomous)
  - Can't schedule new pods
- **Production**: 3-5 masters, load balancer, etcd cluster
- **Why not implemented**: Resource constraints (12GB for 3 masters)

### Q9: How does Flannel work?

**Answer:**
- **Flannel** = CNI plugin for pod networking
- **How**:
  - Each node gets subnet (10.244.0.0/24, 10.244.1.0/24)
  - Creates VXLAN tunnel between nodes
  - Encapsulates pod traffic, sends via host network
  - Decapsulates on destination node
- **Config**: `--iface=enp0s8` forces host-only network

### Q10: Docker vs containerd?

**Answer:**
- **Docker**: Full platform (CLI, daemon, build, registry)
- **containerd**: Just the runtime (part of Docker)
- **Why containerd**:
  - K8s deprecated Docker in 1.24
  - Lighter, faster
  - Implements CRI standard
- **In project**:
  - K8s nodes: containerd
  - Services VM: Docker (for Gitea, Nexus)

---

## ⚠️ MAIN PROBLEMS SOLVED

### 1. Dual NIC Problem
**Problem**: VMs have NAT (10.0.2.15) and host-only (192.168.56.x). Flannel used wrong interface.

**Fix**:
```yaml
# Flannel
- --iface=enp0s8

# kubelet
KUBELET_EXTRA_ARGS=--node-ip=192.168.56.x
```

### 2. kube-proxy API Connection
**Problem**: kube-proxy ConfigMap had NAT IP, couldn't reach API server.

**Fix**:
```bash
kubectl -n kube-system get cm kube-proxy -o yaml \
  | sed 's|server: https://.*:6443|server: https://192.168.56.10:6443|' \
  | kubectl apply -f -
```

### 3. containerd cgroup Mismatch
**Problem**: K8s uses systemd, containerd defaulted to cgroupfs.

**Fix**:
```toml
SystemdCgroup = true
```

### 4. Nexus Registry Auth
**Problem**: K8s couldn't pull from private registry.

**Fix**:
```bash
kubectl create secret docker-registry nexus-registry-creds \
  --docker-server=192.168.56.20:8082 \
  --docker-username=admin \
  --docker-password=adminadmin
```

---

## 🎬 DEMO SCRIPT (10 minutes)

### 1. Infrastructure (2 min)
```bash
vagrant status
vagrant ssh k8s-master -c "kubectl get nodes"
vagrant ssh k8s-master -c "kubectl get pods -A"
```

### 2. Services (1 min)
```bash
vagrant ssh services -c "docker ps"
vagrant ssh services -c "showmount -e localhost"
```

### 3. Jenkins (2 min)
- Open http://192.168.56.10:30080
- Show jobs: todo-frontend, todo-backend
- Show last build logs

### 4. Application (2 min)
```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get pods -o wide"
```
- Open http://192.168.56.10:30081
- Test backend: `curl http://192.168.56.10:30082/api/health`

### 5. CI/CD Demo (3 min)
- Make small change to frontend
- Push to Gitea
- Show Jenkins pipeline triggered
- Show pods restarting
- Show change in browser

---

## 📝 FINAL CHECKLIST

### Before Presentation:
- [ ] Run `vagrant up` and verify everything works
- [ ] Test complete CI/CD flow
- [ ] Prepare browser tabs:
  - Jenkins: http://192.168.56.10:30080
  - Gitea: http://192.168.56.20:3000
  - Nexus: http://192.168.56.20:8081
  - Frontend: http://192.168.56.10:30081
- [ ] Have terminal ready with SSH to k8s-master
- [ ] Clean up files (see cleanup section)
- [ ] Print this document

### Key Points to Emphasize:
1. **Fully automated**: Single `vagrant up` command
2. **Production-like**: Real multi-node cluster
3. **Cloud-native**: Jenkins in Kubernetes
4. **Secure**: RBAC, namespaces, rootless builds
5. **Persistent**: NFS-backed storage
6. **Complete workflow**: Git → CI → Registry → CD

---

## 🎓 WHAT TO STUDY TODAY

### Must Know:
1. **Architecture**: Control plane vs workers, what each component does
2. **CI/CD Flow**: Every step from git push to running app
3. **Networking**: How pods communicate across nodes (Flannel/VXLAN)
4. **Storage**: Why NFS, how PV/PVC work
5. **Security**: RBAC, ServiceAccount, Roles
6. **Problems solved**: Dual NIC, kube-proxy, cgroup driver

### Practice Commands:
```bash
kubectl get nodes
kubectl get pods -A
kubectl describe pod <name>
kubectl logs <pod>
kubectl get pv,pvc -A
kubectl auth can-i <verb> <resource> --as=<serviceaccount>
```

---

## 🚀 GOOD LUCK!

**Remember**: You built a complete software factory platform with:
- ✅ Automated provisioning (Vagrant + Ansible)
- ✅ Production-grade Kubernetes cluster
- ✅ Full CI/CD pipeline (Gitea → Jenkins → Nexus → K8s)
- ✅ Security best practices (RBAC, namespaces, Kaniko)
- ✅ Persistent storage (NFS)

**You know this project inside and out. Be confident!**
