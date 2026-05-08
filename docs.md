# PRESENTATION PREPARATION DOCUMENT
## Kubernetes Software Factory Platform - Final Review

---

## 📋 FILES TO CLEAN UP

### Recommended Deletions:

1. **docs/kubernetes-guide-tunisien.*** (all LaTeX build artifacts)
   - `.aux`, `.fdb_latexmk`, `.log`, `.out`, `.toc`
   - **Why**: Build artifacts, not source files. Keep only `.tex` and `.pdf`

2. **.claude/** folder
   - **Why**: IDE-specific settings, not part of the project deliverable

3. **JENKINS_KANIKO_MIGRATION.md**
   - **Why**: Internal migration notes, not relevant for presentation

### Keep These Files:
- `README.md` - Main documentation
- `DOCUMENTATION.md` - Detailed French documentation
- `Vagrantfile` - Infrastructure definition
- `ansible/` - All automation code
- `apps/` - Application code
- `.gitignore`, `.gitattributes` - Git configuration
- `.kubeconfig-for-jenkins` - Jenkins Kubernetes access (needed for CI/CD)

---

## 🏗️ CURRENT ARCHITECTURE

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

### Required Architecture:

1. ✅ **VM Tools**: Gitea, Nexus, NFS on services VM
2. ✅ **Kubernetes Master**: Jenkins running IN Kubernetes (not on services VM)
3. ✅ **Two Worker Nodes**: Deploy frontend, backend, database
4. ✅ **NFS Connection**: Workers use NFS for persistent storage
5. ✅ **CI/CD Workflow**: Push → Jenkins → Build → Nexus → Deploy

### Key Differences/Improvements:

| Aspect | Required | Your Implementation | Status |
|--------|----------|---------------------|--------|
| Jenkins Location | On Master Node | **Inside Kubernetes cluster** | ✅ **Better** - Cloud-native |
| Jenkins Storage | Not specified | **NFS-backed PVC** | ✅ **Better** - Persistent |
| Build Method | Docker-in-Docker | **Kaniko** (rootless) | ✅ **Better** - Secure |
| RBAC | Not specified | **ServiceAccount + Roles** | ✅ **Bonus** - Security |
| Namespaces | Not specified | **jenkins + todo-app** | ✅ **Bonus** - Isolation |
| Database Storage | Not specified | **NFS PersistentVolume** | ✅ **Required** |

### Architecture Advantages:

1. **Jenkins in Kubernetes**: Scales, self-heals, cloud-native
2. **Kaniko**: No Docker daemon needed, more secure
3. **RBAC**: Least-privilege access for Jenkins
4. **Namespaces**: Logical isolation between CI/CD and apps
5. **NFS**: Centralized storage, survives pod restarts

---

## 📁 PROJECT STRUCTURE

```
```
k8s-project/
├── Vagrantfile                    # 4 VMs definition
├── README.md                      # Quick start guide
├── DOCUMENTATION.md               # Detailed documentation (French)
│
├── ansible/                       # Automation
│   ├── playbook.yml              # Main orchestration
│   ├── inventory.ini             # Hosts definition
│   ├── group_vars/all.yml        # Configuration variables
│   │
│   └── roles/                    # Ansible roles
│       ├── common/               # System prerequisites
│       ├── containerd/           # Container runtime
│       ├── kubernetes/           # K8s packages
│       ├── master/               # Control plane init
│       ├── workers/              # Worker join
│       ├── cni/                  # Flannel networking
│       ├── nfs/                  # NFS server
│       ├── docker/               # Docker on services VM
│       ├── gitea/                # Git server
│       ├── nexus/                # Docker registry
│       └── jenkins/              # Jenkins in K8s
│
└── apps/todo/                    # Sample application
    ├── frontend/                 # Nginx + HTML/CSS/JS
    │   ├── Dockerfile
    │   ├── index.html
    │   ├── style.css
    │   └── app.js
    │
    ├── backend/                  # Node.js API
    │   ├── Dockerfile
    │   ├── package.json
    │   └── src/server.js
    │
    └── k8s/                      # Kubernetes manifests
        ├── namespace.yml
        ├── frontend.yml
        ├── backend.yml
        └── postgres.yml
```

---

## 🔄 CI/CD WORKFLOW

### Complete Flow:

```
```
1. Developer writes code
   ↓
2. git push to Gitea (192.168.56.20:3000)
   ↓
3. Gitea webhook triggers Jenkins (192.168.56.10:30080)
   ↓
4. Jenkins spawns Kaniko pod in K8s
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

### Technical Details:

**Jenkins Pipeline (Jenkinsfile):**

```groovy
```groovy
pipeline {
  agent {
    kubernetes {
      yaml '''
        apiVersion: v1
        kind: Pod
        spec:
          containers:
          - name: kaniko
            image: gcr.io/kaniko-project/executor:debug
            command: ['sleep', '99999']
            volumeMounts:
            - name: docker-config
              mountPath: /kaniko/.docker
          volumes:
          - name: docker-config
            secret:
              secretName: nexus-registry-creds
      '''
    }
  }
  stages {
    stage('Build') {
      steps {
        container('kaniko') {
          sh '/kaniko/executor --context=dir://. --destination=192.168.56.20:8082/todo-backend:${BUILD_NUMBER}'
        }
      }
    }
    stage('Deploy') {
      steps {
        sh 'kubectl set image deployment/todo-backend todo-backend=192.168.56.20:8082/todo-backend:${BUILD_NUMBER} -n todo-app'
      }
    }
  }
}
```

---

## 🛠️ TOOLS USED AND WHY

### Infrastructure Tools:
Tool	Purpose	Why This Choice
Vagrant	VM automation	Cross-platform, declarative, reproducible
VirtualBox	Hypervisor	Free, widely available, good for learning
Ansible	Configuration management	Idempotent, agentless, YAML-based
Kubernetes Tools:
Tool	Purpose	Why This Choice
kubeadm	Cluster bootstrap	Official tool, production-ready
containerd	Container runtime	Docker deprecated in K8s 1.24+
Flannel	Pod networking (CNI)	Simple, reliable, good for learning
kubectl	Cluster management	Official CLI tool
CI/CD Tools:
Tool	Purpose	Why This Choice
Gitea	Git server	Lightweight, self-hosted, easy setup
Nexus	Docker registry	Supports multiple formats, enterprise-ready
Jenkins	CI/CD automation	Industry standard, extensible, Kubernetes plugin
Kaniko	Image builder	No Docker daemon, secure, K8s-native
Storage:
Tool	Purpose	Why This Choice
NFS	Shared storage	Simple, ReadWriteMany support, centralized
⚠️ MAIN PROBLEMS ENCOUNTERED AND FIXES
1. Dual NIC Problem (Vagrant VMs)
Problem: VMs have 2 network interfaces:

enp0s3 (NAT): 10.0.2.15 (same on all VMs)
enp0s8 (Host-only): 192.168.56.x (unique)
Flannel and kubelet defaulted to NAT interface → nodes couldn't communicate.

Fix:

# Flannel: Force use of host-only interface
- --iface=enp0s8

# kubelet: Set node IP explicitly
KUBELET_EXTRA_ARGS=--node-ip=192.168.56.x
Location: 
main.yml
, 
main.yml

2. kube-proxy API Server Connection
Problem: After kubeadm init, kube-proxy ConfigMap had NAT IP (10.0.2.15) instead of master IP (192.168.56.10) → kube-proxy couldn't reach API server → Flannel failed → workers stayed NotReady.

Fix:

# Patch kube-proxy ConfigMap to use correct API server address
kubectl -n kube-system get cm kube-proxy -o yaml \
  | sed 's|server: https://.*:6443|server: https://192.168.56.10:6443|' \
  | kubectl apply -f -
kubectl -n kube-system rollout restart ds/kube-proxy
Location: 
main.yml

3. containerd cgroup Driver Mismatch
Problem: Kubernetes uses systemd cgroup driver by default, but containerd defaults to cgroupfs → pods crash with cgroup errors.

Fix:

# /etc/containerd/config.toml
[plugins."io.containerd.grpc.v1.cri".containerd.runtimes.runc.options]
  SystemdCgroup = true
Location: 
main.yml

4. Jenkins Docker-in-Docker Security
Problem: Running Docker inside Docker requires privileged mode → security risk.

Fix: Use Kaniko instead:

Builds images without Docker daemon
Runs unprivileged
Kubernetes-native
Location: ansible/roles/jenkins/, Jenkinsfiles in app repos

5. Nexus Registry Authentication
Problem: Kubernetes couldn't pull images from Nexus (private registry).

Fix: Create imagePullSecrets:

kubectl create secret docker-registry nexus-registry-creds \
  --docker-server=192.168.56.20:8082 \
  --docker-username=admin \
  --docker-password=adminadmin \
  -n todo-app
Location: 
main.yml
, apps/todo/k8s/*.yml

6. NFS Permissions
Problem: Postgres pod couldn't write to NFS volume → permission denied.

Fix:

# NFS export with no_root_squash
/srv/nfs/todo-postgres-data  192.168.56.0/24(rw,sync,no_subtree_check,no_root_squash)

# Pod security context
securityContext:
  fsGroup: 999  # postgres user
Location: 
main.yml
, 
postgres.yml

🎯 VERIFICATION COMMANDS FOR DEMO
1. Check Cluster Status:
# From host machine
vagrant status

# Check all nodes are Ready
vagrant ssh k8s-master -c "kubectl get nodes"

# Expected output:
# NAME          STATUS   ROLES           AGE   VERSION
# k8s-master    Ready    control-plane   Xh    v1.29.2
# k8s-worker1   Ready    <none>          Xh    v1.29.2
# k8s-worker2   Ready    <none>          Xh    v1.29.2
2. Check System Pods:
vagrant ssh k8s-master -c "kubectl get pods -A"

# Expected: All Running
# - kube-system: API server, etcd, scheduler, controller, CoreDNS, kube-proxy, Flannel
# - jenkins: Jenkins pod
# - todo-app: frontend, backend, postgres
3. Check Services VM:
vagrant ssh services -c "docker ps"

# Expected: gitea, nexus containers running

vagrant ssh services -c "showmount -e localhost"

# Expected NFS exports:
# /srv/nfs/jenkins-data
# /srv/nfs/todo-postgres-data
4. Check Jenkins:
# Get Jenkins URL
echo "http://192.168.56.10:30080"

# Get initial admin password
vagrant ssh k8s-master -c "kubectl -n jenkins exec deploy/jenkins -- cat /var/jenkins_home/secrets/initialAdminPassword"
5. Check Application:
# Frontend
curl -I http://192.168.56.10:30081/

# Backend health check
curl http://192.168.56.10:30082/api/health

# Check pods are on different workers
vagrant ssh k8s-master -c "kubectl -n todo-app get pods -o wide"
6. Check Persistent Storage:
vagrant ssh k8s-master -c "kubectl get pv,pvc -A"

# Expected:
# - jenkins-pv → jenkins-home PVC
# - todo-postgres-pv → todo-postgres-pvc
7. Verify RBAC:
# Check Jenkins ServiceAccount permissions
vagrant ssh k8s-master -c "kubectl auth can-i create pods -n jenkins --as=system:serviceaccount:jenkins:jenkins"
# Expected: yes

vagrant ssh k8s-master -c "kubectl auth can-i patch deployment -n todo-app --as=system:serviceaccount:jenkins:jenkins"
# Expected: yes
❓ LIKELY PRESENTATION QUESTIONS WITH ANSWERS
Q1: Why did you put Jenkins inside Kubernetes instead of on the services VM?
Answer:

Cloud-native approach: Jenkins as a pod benefits from Kubernetes features (self-healing, scaling, resource management)
Persistent storage: Uses NFS-backed PVC, survives pod restarts
Security: RBAC controls what Jenkins can do in the cluster
Scalability: Can scale Jenkins agents as Kubernetes pods
Professor's requirement: "Jenkins on Kubernetes Node Master" - interpreted as Jenkins running IN the Kubernetes cluster on the master node
Q2: What is Kaniko and why did you use it?
Answer:

Kaniko is a tool to build Docker images inside Kubernetes without needing a Docker daemon
Why:
Docker-in-Docker requires privileged mode (security risk)
Kaniko runs unprivileged
Kubernetes-native, designed for CI/CD pipelines
No need to mount 
docker.sock
How it works: Reads Dockerfile, builds image layer by layer, pushes to registry
Q3: Explain the complete CI/CD workflow step by step.
Answer:

Developer pushes code to Gitea repository
Gitea webhook notifies Jenkins
Jenkins pipeline starts, spawns a Kaniko pod
Kaniko pod:
Checks out code from Gitea
Builds Docker image from Dockerfile
Pushes image to Nexus registry (192.168.56.20:8082)
Jenkins runs kubectl set image to update deployment
Kubernetes:
Pulls new image from Nexus
Performs rolling update (zero downtime)
Old pods terminate, new pods start
Application accessible via NodePort
Q4: What is the difference between a Pod and a Deployment?
Answer:

Pod: Smallest unit in Kubernetes, runs one or more containers. If it dies, it's gone.
Deployment: Manages multiple pod replicas, ensures desired state:
If a pod dies, Deployment creates a new one
Handles rolling updates
Can scale up/down
Provides rollback capability
Example: todo-backend Deployment manages todo-backend pods
Q5: Why do you need NFS? Can't you use local storage?
Answer:

Problem with local storage:
Tied to a specific node
If pod moves to another node, data is lost
Can't share between pods
NFS advantages:
ReadWriteMany: Multiple pods can access simultaneously
Centralized: Data survives pod/node failures
Persistent: Database data, Jenkins home directory persist
Use cases in project:
Jenkins home directory (plugins, jobs, credentials)
Postgres database files
Q6: What is a Service in Kubernetes?
Answer:

Problem: Pod IPs change when pods restart
Service: Stable network endpoint (virtual IP) that routes traffic to pods
Types:
ClusterIP (default): Internal only, used by postgres service
NodePort: Exposes on all nodes, used by todo-frontend (30081), todo-backend (30082), jenkins (30080)
LoadBalancer: Cloud provider integration (not used in our project)
How it works: Uses labels to select pods, kube-proxy manages iptables rules
Q7: What is RBAC and why did you implement it?
Answer:

RBAC = Role-Based Access Control
Purpose: Control what Jenkins can do in Kubernetes
Implementation:
ServiceAccount: jenkins (identity for Jenkins pod)
Role in jenkins namespace: Can create/delete pods (for agents)
Role in todo-app namespace: Can update deployments (for CD)
RoleBinding: Links ServiceAccount to Roles
Security benefit: Least-privilege access, Jenkins can't access other namespaces or delete critical resources
Q8: What happens if the master node fails?
Answer:

Current setup: Single master = single point of failure
Impact:
Can't create/update/delete resources (API server down)
Existing pods keep running (kubelet is autonomous)
Can't schedule new pods
Production solution: High Availability (HA) setup:
3 or 5 master nodes
Load balancer in front of API servers
etcd cluster (external or stacked)
Not implemented: Resource constraints (would need 3x4GB = 12GB just for masters)
Q9: How does Flannel work?
Answer:

Flannel is a CNI (Container Network Interface) plugin
Purpose: Enable pod-to-pod communication across nodes
How it works:
Each node gets a subnet (e.g., 10.244.0.0/24, 10.244.1.0/24)
Flannel creates a VXLAN tunnel between nodes
When pod A (10.244.0.5) talks to pod B (10.244.1.3):
Packet goes to Flannel on node A
Flannel encapsulates in VXLAN
Sends via host network (192.168.56.x)
Flannel on node B decapsulates
Delivers to pod B
Configuration: --iface=enp0s8 forces use of host-only network
Q10: What is the difference between Docker and containerd?
Answer:

Docker: Full platform (CLI, daemon, build tools, registry client, etc.)
containerd: Just the container runtime (part of Docker)
Why containerd:
Kubernetes deprecated Docker support in 1.24
containerd is lighter, faster
Implements CRI (Container Runtime Interface) standard
Docker was too heavy for Kubernetes needs
In our project:
Kubernetes nodes use containerd
Services VM uses Docker (for Gitea, Nexus)
Q11: How do you troubleshoot a pod that won't start?
Answer:

# 1. Check pod status
kubectl get pods -n <namespace>

# 2. Describe pod (see events)
kubectl describe pod <pod-name> -n <namespace>

# Common issues:
# - ImagePullBackOff: Wrong image name or registry auth
# - CrashLoopBackOff: Application error, check logs
# - Pending: Not enough resources or node selector mismatch

# 3. Check logs
kubectl logs <pod-name> -n <namespace>
kubectl logs <pod-name> -n <namespace> --previous  # Previous container

# 4. Execute into pod (if running)
kubectl exec -it <pod-name> -n <namespace> -- /bin/sh
Q12: What security improvements did you implement? (Bonus points)
Answer:

RBAC: Least-privilege access for Jenkins
Namespaces: Logical isolation (jenkins, todo-app, kube-system)
Kaniko: Rootless image builds, no Docker daemon
ServiceAccount: Jenkins doesn't use default account
imagePullSecrets: Secure registry authentication
Network isolation: Pods in different namespaces can't talk by default
No privileged containers: All pods run unprivileged
Could add (mention if asked):

Network Policies (firewall between pods)
Pod Security Standards
Secrets encryption at rest (etcd)
TLS for all services
Image scanning in CI/CD
Q13: Walk me through the Ansible provisioning process.
Answer:

vagrant up
  ↓
1. VirtualBox creates 4 VMs
  ↓
2. When services VM starts (last):
   - Vagrant uploads ansible/ folder
   - Installs Ansible via pip
   - Runs ansible-playbook
  ↓
3. Ansible Play 1 (k8s-master, worker1, worker2):
   - Role: common → Disable swap, load kernel modules, sysctl
   - Role: containerd → Install, configure SystemdCgroup
   - Role: kubernetes → Install kubeadm, kubelet, kubectl
  ↓
4. Ansible Play 2 (k8s-master only):
   - Role: master → kubeadm init, configure kubectl, generate join token
   - Role: cni → Deploy Flannel with --iface=enp0s8
  ↓
5. Ansible Play 3 (worker1, worker2):
   - Role: workers → kubeadm join using token from master
  ↓
6. Ansible Play 4 (services VM):
   - Install packages, configure /etc/hosts
  ↓
7. Ansible Play 5 (services VM):
   - Role: nfs → Create exports, start NFS server
   - Role: docker → Install Docker CE
   - Role: gitea → Deploy via docker-compose
   - Role: nexus → Deploy via docker-compose
  ↓
8. Ansible Play 6 (k8s-master):
   - Role: jenkins → Deploy Jenkins in Kubernetes
  ↓
9. Ansible Play 7 (k8s-master):
   - Validation → Check nodes Ready, display pods
Q14: What would you do differently in production?
Answer:

High Availability:

3+ master nodes
External etcd cluster
Load balancer for API server
Security:

TLS everywhere (Gitea, Nexus, Jenkins)
Network Policies
Pod Security Standards
Secrets encryption
Image scanning
Regular security audits
Monitoring & Logging:

Prometheus + Grafana
EFK/ELK stack
Alerting (PagerDuty, Slack)
Storage:

Distributed storage (Ceph, Longhorn)
Automated backups
Disaster recovery plan
CI/CD:

GitOps (ArgoCD, Flux)
Automated testing
Staging environment
Canary deployments
Infrastructure:

Cloud provider (EKS, GKE, AKS)
Infrastructure as Code (Terraform)
Automated scaling
🎬 DEMO SCRIPT
1. Show Infrastructure (2 minutes)
# Show VMs are running
vagrant status

# Show cluster is healthy
vagrant ssh k8s-master -c "kubectl get nodes"
vagrant ssh k8s-master -c "kubectl get pods -A"
2. Show Services VM (1 minute)
# Show Gitea and Nexus
vagrant ssh services -c "docker ps"

# Show NFS exports
vagrant ssh services -c "showmount -e localhost"
3. Show Jenkins (2 minutes)
# Open Jenkins in browser
# http://192.168.56.10:30080

# Show jobs: todo-frontend, todo-backend
# Show last build logs
4. Show Application (2 minutes)
# Show pods running on workers
vagrant ssh k8s-master -c "kubectl -n todo-app get pods -o wide"

# Open frontend in browser
# http://192.168.56.10:30081

# Test backend API
curl http://192.168.56.10:30082/api/health
5. Demonstrate CI/CD (3 minutes)
# Make a small change to frontend (e.g., change title)
# Push to Gitea
# Show Jenkins pipeline triggered
# Show new image in Nexus
# Show pods restarting
# Show change in browser
6. Show Persistent Storage (1 minute)
# Show PVs and PVCs
vagrant ssh k8s-master -c "kubectl get pv,pvc -A"

# Show Jenkins data persists
vagrant ssh k8s-master -c "kubectl -n jenkins delete pod -l app=jenkins"
# Wait for pod to restart
# Show Jenkins still has jobs and configuration
📝 FINAL CHECKLIST
Before Presentation:
 Run vagrant up and verify everything works
 Test complete CI/CD flow (push code → Jenkins → deploy)
 Prepare browser tabs:
Jenkins: http://192.168.56.10:30080
Gitea: http://192.168.56.20:3000
Nexus: http://192.168.56.20:8081
Frontend: http://192.168.56.10:30081
 Have terminal ready with SSH to k8s-master
 Print this document for reference
 Clean up unnecessary files (see "Files to Clean Up" section)
During Presentation:
 Explain architecture diagram clearly
 Demonstrate working CI/CD pipeline
 Show persistent storage (delete pod, data survives)
 Explain security features (RBAC, namespaces, Kaniko)
 Be ready to answer technical questions
Key Points to Emphasize:
Fully automated: Single command (vagrant up) creates everything
Production-like: Real multi-node cluster, not a toy
Cloud-native: Jenkins in Kubernetes, not on VM
Secure: RBAC, namespaces, rootless builds
Persistent: NFS-backed storage for database and Jenkins
Complete workflow: Git → CI → Registry → CD → Running app
🎓 STUDY TIPS
Understand These Concepts Deeply:
Kubernetes architecture: Control plane vs workers
Pod lifecycle: Pending → Running → Succeeded/Failed
Service types: ClusterIP, NodePort, LoadBalancer
Persistent storage: PV, PVC, StorageClass
RBAC: ServiceAccount, Role, RoleBinding
Networking: Pod network, Service network, CNI
CI/CD: Build,