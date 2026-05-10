# Refactor Walkthrough — What Was Done and Why

## Overview of Changes

The refactor touched **35 files** across the project. Here's a map of every change, organized by improvement.

---

## 1. Ansible Vault for Secrets

### Problem
Your `nexus_admin_password: "adminadmin"` was sitting in `group_vars/all.yml` in plaintext. Anyone with access to the repo sees your credentials. In a defense/oral exam, this is an easy attack point for the jury.

### What was created

| File | Purpose |
|---|---|
| [ansible.cfg](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/ansible.cfg) | Central Ansible config — sets `vault_password_file = .vault_pass` so you never need to type `--ask-vault-pass` |
| [.vault_pass](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/.vault_pass) | Contains the password used to encrypt/decrypt the vault. Currently `changeme`. **Never committed to Git** (added to `.gitignore`) |
| [group_vars/all/vars.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/group_vars/all/vars.yml) | All non-secret variables (moved from `all.yml`) |
| [group_vars/all/vault.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/group_vars/all/vault.yml) | Secret variables — currently plaintext, meant to be encrypted |

### How the vault chain works

```
.vault_pass                    ← contains the encryption password ("changeme")
    ↓
ansible.cfg                    ← tells Ansible where to find that password
    ↓
group_vars/all/vault.yml       ← encrypted file containing: vault_nexus_admin_password: "adminadmin"
    ↓
group_vars/all/vars.yml        ← references it: nexus_admin_password: "{{ vault_nexus_admin_password }}"
    ↓
roles/jenkins/tasks/main.yml   ← uses {{ nexus_admin_password }} — gets the real value at runtime
```

### Why a directory instead of a single file

Ansible supports both `group_vars/all.yml` (single file) and `group_vars/all/` (directory with multiple files). The directory approach lets you separate secrets from plain config. Ansible auto-loads every `.yml` inside the directory.

> [!IMPORTANT]
> The old `group_vars/all.yml` file was emptied (deprecation notice only) but **you must delete it** to avoid variable conflicts. Ansible would load BOTH the file and the directory, causing duplicates.

### To actually encrypt the vault
```bash
# On the services VM or any machine with Ansible:
cd /home/vagrant/ansible
ansible-vault encrypt group_vars/all/vault.yml
# It will use the password from .vault_pass automatically
```

---

## 2. Helm for Jenkins

### Problem
Your old Jenkins deployment used a **162-line raw Kubernetes manifest** ([jenkins-manifest.yml.j2](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/templates/jenkins-manifest.yml.j2)). This means you're maintaining the Deployment spec, Service spec, resource limits, update strategy, etc. — all things the official Jenkins Helm chart handles with tested defaults and upgrade paths.

### What was created

| File | Purpose |
|---|---|
| [roles/helm/tasks/main.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/helm/tasks/main.yml) | New role: installs Helm 3 binary via official script |
| [roles/helm/defaults/main.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/helm/defaults/main.yml) | Default: `helm_version: "v3.14.2"` |
| [jenkins-prereqs.yml.j2](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/templates/jenkins-prereqs.yml.j2) | K8s resources Helm **doesn't manage**: Namespaces, RBAC, NFS PV/PVC |
| [jenkins-values.yml.j2](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/templates/jenkins-values.yml.j2) | Helm values file passed to `helm install` |
| [roles/jenkins/tasks/main.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/tasks/main.yml) | **Rewritten** — now uses `helm install/upgrade` |

### The old vs new Jenkins deployment flow

**Old flow (raw manifests):**
```
Template 162-line YAML → kubectl apply → wait → get password
```

**New flow (Helm):**
```
1. Apply prereqs (namespaces, RBAC, PV/PVC) → kubectl apply
2. helm repo add jenkins
3. Template values file (35 lines, not 162)
4. helm install jenkins jenkins/jenkins --values jenkins-values.yml
5. Create nexus-registry-creds secret
6. Wait for HTTP → get password
```

### Why split the manifest?

The Jenkins Helm chart manages its own Deployment, Service, and ServiceAccount. But it does **NOT** manage:
- The `todo-app` namespace (your app namespace)
- The cross-namespace RBAC (Jenkins SA → todo-app deployer role)
- The NFS-backed PersistentVolume (infrastructure, not app concern)

So those resources were extracted into [jenkins-prereqs.yml.j2](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/templates/jenkins-prereqs.yml.j2) and applied with `kubectl apply` before the Helm install.

### Why `helm install` AND `helm upgrade`?

The task checks if the release exists first:
```yaml
- name: Check if Jenkins Helm release exists
  command: helm status jenkins -n jenkins
  register: jenkins_helm_check

- name: Install Jenkins via Helm        # runs if NOT installed
  command: helm install ...
  when: jenkins_helm_check.rc != 0

- name: Upgrade Jenkins via Helm         # runs if ALREADY installed
  command: helm upgrade ...
  when: jenkins_helm_check.rc == 0
```
This makes it idempotent — first run installs, subsequent runs upgrade with any changed values.

### The old manifest file

The old [jenkins-manifest.yml.j2](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/templates/jenkins-manifest.yml.j2) is still present but **no longer used**. You can delete it safely.

---

## 3. NGINX Ingress Controller

### Problem
Every service in your cluster uses its own `NodePort`. This means:
- Jenkins on `:30080`, todo-frontend on `:30081`, todo-API on `:30082`
- You run out of memorable ports fast
- No SSL termination, no path-based routing

An Ingress Controller gives you a **single entry point** that routes based on hostname or path.

### What was created

| File | Purpose |
|---|---|
| [roles/nginx-ingress/tasks/main.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/nginx-ingress/tasks/main.yml) | Deploys `ingress-nginx` via Helm |
| [roles/nginx-ingress/defaults/main.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/nginx-ingress/defaults/main.yml) | Defaults: namespace, NodePort `31080`/`31443` |

### How it works

```
Host browser
    ↓
http://192.168.56.10:31080
    ↓
NGINX Ingress Controller (NodePort)
    ↓ (reads Ingress resources)
    ├── /jenkins  → jenkins:8080
    ├── /todo     → todo-frontend:80
    └── /api      → todo-backend:3000
```

### Key Helm flags explained

```yaml
--set controller.service.type=NodePort              # bare-metal, no LoadBalancer
--set controller.service.nodePorts.http=31080        # predictable port
--set controller.admissionWebhooks.enabled=false     # avoids webhook cert issues on local clusters
```

> [!NOTE]
> The Ingress Controller is deployed but **no Ingress resources are created yet**. You would need to create them for your services (e.g., `kubectl apply -f ingress-for-todo.yml`). The controller is the infrastructure — Ingress resources are the routing rules.

---

## 4. Role `defaults/main.yml` Files

### Problem
Your roles had **no documentation of their variable interface**. Someone reading `roles/gitea/tasks/main.yml` sees `{{ gitea_http_port }}` but has no idea what the default is without digging through `group_vars/all.yml`.

### What was created

Every role now has a `defaults/main.yml`:

| Role | Key defaults |
|---|---|
| [common](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/common/defaults/main.yml) | `common_packages`, `cluster_hosts` |
| [containerd](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/containerd/defaults/main.yml) | `services_ip`, `nexus_docker_port` |
| [kubernetes](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/kubernetes/defaults/main.yml) | `kube_version`, `kube_apt_key_url` |
| [master](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/master/defaults/main.yml) | `pod_network_cidr`, `master_ip` |
| [cni](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/cni/defaults/main.yml) | `flannel_manifest_url` |
| [workers](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/workers/defaults/main.yml) | *(empty — uses hostvars)* |
| [nfs](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/nfs/defaults/main.yml) | `nfs_exports`, `nfs_allowed_network` |
| [docker](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/docker/defaults/main.yml) | *(empty — uses Ansible facts)* |
| [gitea](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/gitea/defaults/main.yml) | `gitea_http_port`, `gitea_ssh_port` |
| [nexus](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/nexus/defaults/main.yml) | `nexus_http_port`, `nexus_docker_port` |
| [jenkins](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/jenkins/defaults/main.yml) | `jenkins_nodeport`, `jenkins_chart_version` |
| [helm](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/helm/defaults/main.yml) | `helm_version` |
| [nginx-ingress](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/roles/nginx-ingress/defaults/main.yml) | `ingress_namespace`, `ingress_http_nodeport` |

### Why this matters (Ansible variable precedence)

```
1. defaults/main.yml          ← LOWEST priority (we added these)
2. group_vars/all/vars.yml     ← HIGHER priority (overrides defaults)
3. group_vars/all/vault.yml    ← HIGHER priority (secrets)
4. playbook vars / CLI -e      ← HIGHEST priority
```

The defaults serve as **documentation** — you open a role and immediately know what it needs. The `group_vars` values override them for this specific deployment.

---

## 5. Split Playbooks

### Problem
Your old `playbook.yml` was a **132-line monolith** with 7 plays in one file. If Jenkins breaks, you can't re-run just the Jenkins play — you re-run everything.

### What was created

```
ansible/
├── site.yml                         ← orchestrator (imports all below)
├── playbook.yml                     ← DEPRECATED, redirects to site.yml
└── playbooks/
    ├── cluster-prepare.yml          ← Play 1: common + containerd + kubernetes
    ├── cluster-init.yml             ← Play 2: master + cni
    ├── cluster-join.yml             ← Play 3: workers join
    ├── services-prepare.yml         ← Play 4: apt + /etc/hosts on services VM
    ├── services-deploy.yml          ← Play 5: nfs + docker + gitea + nexus
    ├── jenkins.yml                  ← Play 6: helm + jenkins
    ├── ingress.yml                  ← Play 7: helm + nginx-ingress (NEW)
    └── validate.yml                 ← Play 8: node/pod/service checks
```

### How they connect

[site.yml](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/ansible/site.yml) is just a list of imports:
```yaml
- import_playbook: playbooks/cluster-prepare.yml
- import_playbook: playbooks/cluster-init.yml
- import_playbook: playbooks/cluster-join.yml
- import_playbook: playbooks/services-prepare.yml
- import_playbook: playbooks/services-deploy.yml
- import_playbook: playbooks/jenkins.yml
- import_playbook: playbooks/ingress.yml
- import_playbook: playbooks/validate.yml
```

### Why this is better — you can now do:

```bash
# Full provisioning (same as before):
ansible-playbook site.yml

# Just re-deploy Jenkins after changing values:
ansible-playbook playbooks/jenkins.yml

# Just add the Ingress Controller to an existing cluster:
ansible-playbook playbooks/ingress.yml

# Just validate without changing anything:
ansible-playbook playbooks/validate.yml

# Re-deploy only services VM stuff:
ansible-playbook playbooks/services-deploy.yml
```

### Backward compatibility

The old `playbook.yml` still works — it's now a one-line wrapper:
```yaml
- import_playbook: site.yml
```
The [Vagrantfile](file:///c:/Users/HP/DALI/Shared/Project/k8s-project/Vagrantfile) was updated to call `site.yml` directly (line 101).

---

## Files to Delete (Manual Cleanup)

| File | Why |
|---|---|
| `ansible/group_vars/all.yml` | Replaced by `all/vars.yml` + `all/vault.yml`. **Will cause duplicate variable conflicts if kept.** |
| `ansible/roles/jenkins/templates/jenkins-manifest.yml.j2` | Old monolithic manifest, replaced by `jenkins-prereqs.yml.j2` + Helm |

---

## New Project Structure

```
ansible/
├── ansible.cfg                          ← NEW
├── .vault_pass                          ← NEW (gitignored)
├── inventory.ini
├── site.yml                             ← NEW (main entry point)
├── playbook.yml                         ← DEPRECATED (wrapper)
├── group_vars/
│   ├── all.yml                          ← DEPRECATED (delete this)
│   └── all/                             ← NEW
│       ├── vars.yml                     ← NEW (non-secrets)
│       └── vault.yml                    ← NEW (secrets)
├── playbooks/                           ← NEW (8 standalone playbooks)
│   ├── cluster-prepare.yml
│   ├── cluster-init.yml
│   ├── cluster-join.yml
│   ├── services-prepare.yml
│   ├── services-deploy.yml
│   ├── jenkins.yml
│   ├── ingress.yml
│   └── validate.yml
└── roles/
    ├── common/
    │   ├── defaults/main.yml            ← NEW
    │   ├── handlers/main.yml
    │   └── tasks/main.yml
    ├── containerd/
    │   ├── defaults/main.yml            ← NEW
    │   ├── handlers/main.yml
    │   └── tasks/main.yml
    ├── kubernetes/
    │   ├── defaults/main.yml            ← NEW
    │   └── tasks/main.yml
    ├── master/
    │   ├── defaults/main.yml            ← NEW
    │   └── tasks/main.yml
    ├── cni/
    │   ├── defaults/main.yml            ← NEW
    │   └── tasks/main.yml
    ├── workers/
    │   ├── defaults/main.yml            ← NEW
    │   └── tasks/main.yml
    ├── nfs/
    │   ├── defaults/main.yml            ← NEW
    │   ├── handlers/main.yml
    │   └── tasks/main.yml
    ├── docker/
    │   ├── defaults/main.yml            ← NEW
    │   └── tasks/main.yml
    ├── gitea/
    │   ├── defaults/main.yml            ← NEW
    │   ├── tasks/main.yml
    │   └── templates/docker-compose.yml.j2
    ├── nexus/
    │   ├── defaults/main.yml            ← NEW
    │   ├── tasks/main.yml
    │   └── templates/docker-compose.yml.j2
    ├── helm/                            ← NEW ROLE
    │   ├── defaults/main.yml
    │   └── tasks/main.yml
    ├── jenkins/
    │   ├── defaults/main.yml            ← NEW
    │   ├── tasks/main.yml               ← REWRITTEN (Helm)
    │   └── templates/
    │       ├── jenkins-manifest.yml.j2  ← OLD (delete)
    │       ├── jenkins-prereqs.yml.j2   ← NEW
    │       └── jenkins-values.yml.j2    ← NEW
    └── nginx-ingress/                   ← NEW ROLE
        ├── defaults/main.yml
        └── tasks/main.yml
```
