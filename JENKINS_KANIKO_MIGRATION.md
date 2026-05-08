# Jenkins in Kubernetes + Kaniko Migration

Ey behi, ma tfasakhch Docker. Gitea and Nexus still run on the services VM and still need Docker. Keep the old Docker Jenkins as backup until the Kubernetes Jenkins builds and deploys both Todo apps.

## Current Backup Jenkins

```bash
vagrant ssh services -c "docker ps --filter name=jenkins"
vagrant ssh services -c "docker inspect jenkins --format 'Binds={{json .HostConfig.Binds}} Ports={{json .HostConfig.PortBindings}}'"
```

Expected backup state:

```text
jenkins container on services VM 192.168.56.20
ports: 8080, 50000
data: /opt/jenkins/data
docker access: /var/run/docker.sock and /usr/bin/docker mounted
```

## Apply Migration

Run from the `k8s-project` directory:

```bash
vagrant provision services
```

Create the Nexus registry secrets with the same Nexus credentials used by the old Jenkins `nexus-creds` credential:

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins create secret docker-registry nexus-registry-creds --docker-server=192.168.56.20:8082 --docker-username='<NEXUS_USER>' --docker-password='<NEXUS_PASS>' --dry-run=client -o yaml | kubectl apply -f -"

vagrant ssh k8s-master -c "kubectl -n todo-app create secret docker-registry nexus-registry-creds --docker-server=192.168.56.20:8082 --docker-username='<NEXUS_USER>' --docker-password='<NEXUS_PASS>' --dry-run=client -o yaml | kubectl apply -f -"
```

Push the Kaniko Jenkinsfiles to Gitea:

```bash
cd ../todo-backend
git status
git add Jenkinsfile
git commit -m "Use Kaniko for Kubernetes Jenkins builds"
git push origin main

cd ../todo-frontend
git status
git add Jenkinsfile
git commit -m "Use Kaniko for Kubernetes Jenkins builds"
git push origin main
```

## Verify Kubernetes Jenkins

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins get pods,svc,pvc"
vagrant ssh k8s-master -c "kubectl auth can-i create pods -n jenkins --as=system:serviceaccount:jenkins:jenkins"
vagrant ssh k8s-master -c "kubectl auth can-i patch deployment/todo-frontend -n todo-app --as=system:serviceaccount:jenkins:jenkins"
vagrant ssh k8s-master -c "kubectl auth can-i patch deployment/todo-backend -n todo-app --as=system:serviceaccount:jenkins:jenkins"
```

Open:

```text
http://192.168.56.10:30080
```

Get the first admin password:

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins exec deploy/jenkins -- cat /var/jenkins_home/secrets/initialAdminPassword"
```

## New Jenkins Setup

Install/verify these plugins:

- Kubernetes
- Git
- Pipeline
- Credentials Binding
- Gitea, if you want Gitea webhook integration

Configure Kubernetes cloud:

```text
Kubernetes URL: https://kubernetes.default.svc
Namespace: jenkins
Jenkins URL: http://jenkins.jenkins.svc.cluster.local:8080
Credentials: in-cluster service account
```

Create two Pipeline-from-SCM jobs:

```text
todo-backend
repo: http://192.168.56.20:3000/admin/todo-backend.git
branch: main
script: Jenkinsfile

todo-frontend
repo: http://192.168.56.20:3000/admin/todo-frontend.git
branch: main
script: Jenkinsfile
```

Webhook target for the new Jenkins:

```text
http://192.168.56.10:30080/gitea-webhook/post
```

## Test

Run backend first, then frontend. Then verify:

```bash
vagrant ssh k8s-master -c "kubectl -n todo-app get deploy todo-backend todo-frontend -o wide"
curl http://192.168.56.10:30082/api/health
curl -I http://192.168.56.10:30081/
```

## Rollback

Old Jenkins stays available:

```text
http://192.168.56.20:8080
```

Stop only the new Kubernetes Jenkins:

```bash
vagrant ssh k8s-master -c "kubectl -n jenkins scale deployment/jenkins --replicas=0"
```

Full cleanup only if needed:

```bash
vagrant ssh k8s-master -c "kubectl delete namespace jenkins"
```

Confirm old Jenkins is still alive:

```bash
vagrant ssh services -c "docker ps --filter name=jenkins"
```

## Architecture

```text
Gitea 192.168.56.20:3000
        |
        | webhook / SCM checkout
        v
Jenkins in Kubernetes 192.168.56.10:30080
        |
        | spawns K8s agent pod
        v
Kaniko container builds Dockerfile
        |
        | pushes image
        v
Nexus registry 192.168.56.20:8082
        |
        | Kubernetes pulls image
        v
todo-app namespace
  - todo-frontend deployment
  - todo-backend deployment
  - postgres + NFS PVC
```
