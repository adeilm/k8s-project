# Cheat Sheet — Credentials and Access

Quick reference for the oral defense. All credentials, all URLs, all the commands the professor might ask you to run live.

---

## 1. Web Interfaces

| Service | URL | Username | Password |
|---|---|---|---|
| **Gitea** | http://192.168.56.20:3000 | `admin` | `admin` |
| **Nexus UI** | http://192.168.56.20:8081 | `admin` | `adminadmin` |
| **Jenkins** | http://192.168.56.10:30080 | `admin` | `adminadmin` |
| **Todo frontend** | http://192.168.56.10:30081 | (none) | (none) |
| **Todo backend health** | http://192.168.56.10:30082/api/health | (none) | (none) |
| **Todo backend list** | http://192.168.56.10:30082/api/todos | (none) | (none) |

## 2. Non-UI Endpoints

| Endpoint | Address | Purpose |
|---|---|---|
| **Nexus Docker registry** | `192.168.56.20:8082` | `docker push` / containerd pull |
| **Gitea SSH** | `192.168.56.20:2222` | `git clone ssh://git@192.168.56.20:2222/...` (needs SSH key in Gitea) |
| **NFS** | `192.168.56.20:/srv/nfs/{jenkins-data,todo-postgres-data,mysql-data}` | Cluster persistent storage |
| **Kubernetes API** | `https://192.168.56.10:6443` | kubectl from outside |
| **Jenkins JNLP agent port** | `jenkins.jenkins.svc.cluster.local:50000` (in-cluster only) | Agent → controller link |

## 3. Database (PostgreSQL)

Inside the cluster only:

| Field | Value |
|---|---|
| Host (DNS) | `postgres.todo-app.svc.cluster.local` (or just `postgres` from inside `todo-app`) |
| Port | `5432` |
| Database | `todoapp` |
| Username | `todo` |
| Password | `admin` |
| Connection string used by backend | `postgres://todo:admin@postgres:5432/todoapp` |
| NFS-backed data path | `192.168.56.20:/srv/nfs/todo-postgres-data` |

To open a psql shell:
```bash
vagrant ssh k8s-master -c "kubectl -n todo-app exec -it deploy/postgres -- psql -U todo -d todoapp"
```
Then inside psql: `\dt` lists tables, `SELECT * FROM todos;` reads data.

## 4. Kubernetes Internals

| Item | Value |
|---|---|
| Cluster API server | `192.168.56.10:6443` |
| Kubeconfig file (on master) | `/etc/kubernetes/admin.conf` |
| Jenkins ServiceAccount | `jenkins` in namespace `jenkins` |
| Jenkins SA token (long-lived) | Generate with `kubectl -n jenkins create token jenkins --duration=8760h` |
| Image-pull secret | `nexus-registry-creds` (in namespaces `jenkins` and `todo-app`) |
| Kaniko config mount | `/kaniko/.docker/config.json` (sourced from `nexus-registry-creds`) |

## 5. Gitea Repositories

| Repo | URL | Purpose |
|---|---|---|
| `admin/todo-frontend` | http://192.168.56.20:3000/admin/todo-frontend | Frontend source + Dockerfile + Jenkinsfile |
| `admin/todo-backend` | http://192.168.56.20:3000/admin/todo-backend | Backend source + Dockerfile + Jenkinsfile |

Local clones (on the host):
```
C:\Users\HP\DALI\Shared\Project\todo-frontend
C:\Users\HP\DALI\Shared\Project\todo-backend
```

## 6. Vagrant / VM Access

```bash
vagrant ssh k8s-master       # control plane + Jenkins pod
vagrant ssh k8s-worker1      # worker
vagrant ssh k8s-worker2      # worker
vagrant ssh services         # Gitea + Nexus + NFS
```

All VMs use the default Vagrant user (`vagrant`) and the shared insecure key (no password).

---

## 7. Verification Commands (run during demo)

### Cluster health

```bash
vagrant ssh k8s-master -c "kubectl get nodes -o wide"
vagrant ssh k8s-master -c "kubectl get pods -A -o wide"
```

### Application stack

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get pods,svc,pvc"
curl http://192.168.56.10:30082/api/health
```

### Show that the deployed images come from Nexus

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get deploy -o jsonpath='{range .items[*]}{.metadata.name}: {.spec.template.spec.containers[0].image}{\"\\n\"}{end}'"
```

Expected output:
```
postgres: postgres:16-alpine
todo-backend: 192.168.56.20:8082/todo-backend:<N>
todo-frontend: 192.168.56.20:8082/todo-frontend:<N>
```

### Show Jenkins inside Kubernetes

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins get pods,svc,pvc"
```

### Show services VM containers

```bash
vagrant ssh services -c "sudo docker ps --format 'table {{.Names}}\t{{.Status}}\t{{.Ports}}'"
```

### Show NFS exports

```bash
vagrant ssh services -c "showmount -e localhost"
```

### Show Jenkins build history (rollout per app)

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app rollout history deployment/todo-backend"
vagrant ssh k8s-master -c "kubectl -n todo-app rollout history deployment/todo-frontend"
```

### List images in Nexus

```bash
curl -s -u admin:adminadmin "http://192.168.56.20:8081/service/rest/v1/components?repository=docker-hosted" | grep -E '"name"|"version"'
```

---

## 8. End-to-End Live Demo (90 seconds)

This is the headline demo. Memorise it.

```bash
# 1. Edit something visible in the frontend
cd /c/Users/HP/DALI/Shared/Project/todo-frontend
notepad index.html        # change a heading or color, save

# 2. Push
git add index.html
git commit -m "Demo change"
git push origin main

# 3. Open Jenkins → todo-frontend → watch the new build start automatically
#    Jenkins URL: http://192.168.56.10:30080/job/todo-frontend/

# 4. After ~1-2 min, refresh the browser
#    http://192.168.56.10:30081
#    The change is live.
```

Walk-through of what happens internally (use this sentence verbatim):

> Gitea fires a webhook to Jenkins. Jenkins creates a build-agent pod with three containers — jnlp, kaniko, and kubectl — runs `git clone`, builds the image with Kaniko, pushes it to Nexus, and finally runs `kubectl set image` to update the deployment. Kubernetes does a rolling update, so users never see downtime.

---

## 9. Common Bonus Demos

### Self-healing
```bash
# Kill a pod
vagrant ssh k8s-master -c "kubectl -n todo-app delete pod -l app=todo-frontend"
# Watch Kubernetes recreate it
vagrant ssh k8s-master -c "kubectl -n todo-app get pods -l app=todo-frontend -w"
```

### Scaling
```bash
vagrant ssh k8s-master -c "kubectl -n todo-app scale deployment/todo-frontend --replicas=3"
vagrant ssh k8s-master -c "kubectl -n todo-app get pods -l app=todo-frontend"
# back down
vagrant ssh k8s-master -c "kubectl -n todo-app scale deployment/todo-frontend --replicas=1"
```

### Rollback
```bash
vagrant ssh k8s-master -c "kubectl -n todo-app rollout history deployment/todo-frontend"
vagrant ssh k8s-master -c "kubectl -n todo-app rollout undo deployment/todo-frontend"
```

### Show NFS persistence (kill postgres → data survives)
```bash
vagrant ssh k8s-master -c "kubectl -n todo-app delete pod -l app=postgres"
# Wait ~20 s for new postgres pod, then list todos again — same data
curl http://192.168.56.10:30082/api/todos
```

### Show Kaniko building inside Kubernetes
```bash
# Watch agent pods spawn during a build
vagrant ssh k8s-master -c "kubectl -n jenkins get pods -w"
```

---

## 10. Quick Recovery Commands

If anything breaks during the demo, these solve 90 % of the issues.

| Symptom | Fix |
|---|---|
| Node `NotReady` | `vagrant ssh <node> -c "sudo systemctl restart containerd kubelet"` |
| Backend `/api/health` 500 with `EAI_AGAIN` | `vagrant ssh k8s-master -c "kubectl -n todo-app rollout restart deployment/todo-backend"` |
| Jenkins UI 502/timeout | `vagrant ssh k8s-master -c "kubectl -n jenkins rollout restart deployment/jenkins"` (then wait ~60 s) |
| Pipeline build hangs on `kubectl set image` | API server flapping. Restart containerd/kubelet on master, then **Build Now** again |
| Webhook not firing | `vagrant ssh services -c "sudo docker restart gitea"` and check delivery in Gitea hook page |
| NodePort unreachable from host | Check `vagrant status` — VM might have stopped. `vagrant up --no-provision` if so |

---

## 11. Files Where Each Credential Lives

For the question "where is your password actually stored?":

| Credential | Stored in | Format |
|---|---|---|
| Postgres password | `apps/todo/k8s/postgres.yml` env var | Plain text (would be a Kubernetes Secret in prod) |
| Postgres connection string | `apps/todo/k8s/backend.yml` env var | Plain text |
| Nexus admin password | Set inside Nexus, not in the repo | Hashed in Nexus' database |
| `nexus-registry-creds` Secret | Kubernetes Secret in `jenkins` and `todo-app` namespaces | Base64-encoded `dockerconfigjson` |
| Gitea credentials in Jenkins | Jenkins credential `gitea-creds` (UI-managed) | Encrypted in Jenkins home (`/var/jenkins_home/secrets`) |
| Jenkins admin password | Hashed in `/var/jenkins_home/users/admin/config.xml` | bcrypt |
| Vagrant SSH key | `~/.vagrant.d/insecure_private_keys/vagrant.key.rsa` | Public insecure key |

If asked "is anything sensitive in the repo?" — the only plain-text credential committed is the local Postgres password (`admin`) used for the school demo. In production every value would move to a Kubernetes Secret + Ansible Vault.
