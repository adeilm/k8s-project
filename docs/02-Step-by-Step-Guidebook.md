# Step-by-Step Guidebook — Building a Kubernetes Cluster from Scratch

> **For whom?** A beginner student with no prior Kubernetes experience.
> **What you will build:** A fully automated 3-node Kubernetes cluster using Vagrant, Ansible, and kubeadm.
> **How to use this guide:** Follow each chapter in order. Each step introduces exactly one new concept, shows you the code to write, and explains every line.

---

## Table of Contents

1. [Chapter 1: Understanding the Big Picture](#chapter-1-understanding-the-big-picture)
2. [Chapter 2: Your First Vagrantfile — Creating Virtual Machines](#chapter-2-your-first-vagrantfile--creating-virtual-machines)
3. [Chapter 3: Ansible Fundamentals — Automating Server Configuration](#chapter-3-ansible-fundamentals--automating-server-configuration)
4. [Chapter 4: The Common Role — Preparing Linux for Kubernetes](#chapter-4-the-common-role--preparing-linux-for-kubernetes)
5. [Chapter 5: The Containerd Role — Installing the Container Runtime](#chapter-5-the-containerd-role--installing-the-container-runtime)
6. [Chapter 6: The Kubernetes Role — Installing K8s Packages](#chapter-6-the-kubernetes-role--installing-k8s-packages)
7. [Chapter 7: The Master Role — Initializing the Control Plane](#chapter-7-the-master-role--initializing-the-control-plane)
8. [Chapter 8: The CNI Role — Pod Networking with Flannel](#chapter-8-the-cni-role--pod-networking-with-flannel)
9. [Chapter 9: The Workers Role — Joining Nodes to the Cluster](#chapter-9-the-workers-role--joining-nodes-to-the-cluster)
10. [Chapter 10: Validation & Your First Deployment](#chapter-10-validation--your-first-deployment)

---

## Chapter 1: Understanding the Big Picture

### What is Kubernetes?

Kubernetes (often abbreviated **K8s**) is a platform that manages containers across multiple machines. Think of it as an operating system for your data center:

- You tell Kubernetes: *"Run 3 copies of my web app"*
- Kubernetes figures out **which machines** to put them on
- If a machine dies, Kubernetes **automatically restarts** the containers elsewhere

### What is a Cluster?

A Kubernetes cluster has two types of machines:

- **Master node (Control Plane)**: The "brain" — it decides what runs where, stores configuration, and exposes the API you interact with.
- **Worker nodes**: The "muscles" — they actually run your application containers.

### What are we building?

```
┌─────────────────────────────────────────────┐
│                 Your Laptop                  │
│                                              │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐    │
│  │  Master  │ │ Worker 1 │ │ Worker 2 │    │
│  │ (brain)  │ │ (muscle) │ │ (muscle) │    │
│  └────┬─────┘ └────┬─────┘ └────┬─────┘    │
│       │             │             │          │
│       └─────────────┼─────────────┘          │
│              Private Network                 │
│            192.168.56.0/24                   │
│                                              │
│  ┌──────────┐                                │
│  │ Services │  (NFS, Gitea, Nexus, Jenkins) │
│  └──────────┘  (not in K8s cluster)         │
└─────────────────────────────────────────────┘
```

We'll use **Vagrant** to create the VMs, **Ansible** to configure them, and **kubeadm** to bootstrap Kubernetes.

### Why not just use Docker Desktop or Minikube?

Those tools give you a single-node, pre-built cluster. You learn to *use* Kubernetes but not *how it works*. Building from scratch teaches you:

- What components make up a cluster
- Why certain Linux settings matter (swap, kernel modules, sysctl)
- How nodes discover and join each other
- How pod networking actually works

---

## Chapter 2: Your First Vagrantfile — Creating Virtual Machines

### What is Vagrant?

Vagrant is a tool that creates virtual machines from a text file (the `Vagrantfile`). Instead of clicking through VirtualBox's GUI to create each VM manually, you describe what you want in code, and Vagrant builds it.

### Step 2.1: Create the Project Directory

```bash
mkdir k8s-project
cd k8s-project
```

### Step 2.2: Write the Vagrantfile

Create a file named `Vagrantfile` (no extension) at the root of your project:

```ruby
# -*- mode: ruby -*-
# vi: set ft=ruby :
# =============================================================================
# Vagrantfile — Kubernetes Cluster (1 Master + 2 Workers + 1 Services VM)
# Provider:    VirtualBox
# OS:          Ubuntu 22.04 LTS (Jammy Jellyfish)
# Network:     192.168.56.0/24 (private host-only) + NAT
# Provisioner: Ansible (installed and run from the services VM)
# =============================================================================
```

**What this does:** These are just comments. The first two lines tell text editors to treat this file as Ruby code.

### Step 2.3: Define the VM specifications

```ruby
# ---------- VM definitions ---------------------------------------------------
NODES = [
  { name: "k8s-master",  ip: "192.168.56.10", cpus: 2, memory: 4096 },
  { name: "k8s-worker1", ip: "192.168.56.11", cpus: 2, memory: 2048 },
  { name: "k8s-worker2", ip: "192.168.56.12", cpus: 2, memory: 2048 },
  { name: "services",    ip: "192.168.56.20", cpus: 2, memory: 4096 },
]
```

**Line-by-line explanation:**
- `NODES` is a Ruby array. Each element is a hash (like a dictionary/object) describing one VM.
- `name`: The hostname of the VM (also the VirtualBox VM name).
- `ip`: A static IP on the private network `192.168.56.0/24`. We chose `.10`, `.11`, `.12` for the K8s nodes and `.20` for services.
- `cpus`: Number of virtual CPUs. The master needs 2 (Kubernetes minimum requirement).
- `memory`: RAM in megabytes. The master gets 4 GB (for etcd + API server). Workers get 2 GB each.

> **Why 192.168.56.x?** This is VirtualBox's default host-only network range. It creates an isolated network between your host and the VMs — not accessible from the internet.

### Step 2.4: Configure Vagrant and loop over VMs

```ruby
Vagrant.configure("2") do |config|

  # Base box for all VMs
  config.vm.box = "ubuntu/jammy64"

  # Increase boot timeout to handle resource contention with multiple VMs
  config.vm.boot_timeout = 600

  # Disable default synced folder for performance
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # SSH — keep default insecure key so all VMs share the same keypair
  config.ssh.insert_key = false
```

**Line-by-line explanation:**
- `Vagrant.configure("2")`: Use Vagrant configuration format version 2.
- `config.vm.box = "ubuntu/jammy64"`: All VMs use the same Ubuntu 22.04 base image. Vagrant downloads it automatically the first time.
- `config.vm.boot_timeout = 600`: Wait up to 10 minutes for VMs to boot (creating 4 VMs simultaneously is resource-intensive).
- `config.vm.synced_folder ".", "/vagrant", disabled: true`: By default, Vagrant shares the project folder with each VM. We disable this for performance — we don't need it.
- `config.ssh.insert_key = false`: **Critical!** This tells Vagrant to keep the same SSH key across all VMs instead of generating unique ones. This allows the services VM to SSH into all other VMs using a single key.

### Step 2.5: Define each VM in a loop

```ruby
  NODES.each_with_index do |node_cfg, index|
    config.vm.define node_cfg[:name] do |node|

      # Hostname
      node.vm.hostname = node_cfg[:name]

      # Private network (host-only) with static IP — NAT is added by default
      node.vm.network "private_network", ip: node_cfg[:ip]

      # VirtualBox provider settings
      node.vm.provider "virtualbox" do |vb|
        vb.name   = node_cfg[:name]
        vb.cpus   = node_cfg[:cpus]
        vb.memory = node_cfg[:memory]
        vb.gui    = false

        # Performance tweaks
        vb.customize ["modifyvm", :id, "--natdnshostresolver1", "on"]
        vb.customize ["modifyvm", :id, "--ioapic", "on"]
      end
```

**Line-by-line explanation:**
- `NODES.each_with_index`: Loop over our 4 VM definitions. `index` is 0, 1, 2, 3.
- `config.vm.define node_cfg[:name]`: Create a named VM (e.g., "k8s-master").
- `node.vm.hostname`: Sets the Linux hostname inside the VM.
- `node.vm.network "private_network"`: Creates a second network interface with a static IP. The first interface (NAT) is added automatically for internet access.
- `vb.gui = false`: Don't open a VirtualBox window for each VM.
- `--natdnshostresolver1`: Use the host's DNS resolver (helps with corporate networks/VPNs).
- `--ioapic`: Enables I/O APIC, required for multi-CPU VMs.

### Step 2.6: The Provisioner — Ansible on the Last VM

This is the cleverest part of the setup. Instead of requiring Ansible on your host machine (which doesn't work on Windows), we install Ansible **inside the services VM** and run it from there:

```ruby
      # ----- Provisioner (triggered on the LAST VM only) ---------------------
      if index == NODES.length - 1

        # 1. Upload the ansible/ directory to the services VM
        node.vm.provision "file",
          source:      "ansible",
          destination: "/home/vagrant/ansible"

        # 2. Upload the Vagrant insecure private key for SSH to other VMs
        node.vm.provision "file",
          source:      "~/.vagrant.d/insecure_private_keys/vagrant.key.rsa",
          destination: "/home/vagrant/.ssh/vagrant_rsa"

        # 3. Install Ansible and run the playbook
        node.vm.provision "shell", inline: <<-SHELL
          set -e

          # --- SSH key setup -------------------------------------------------
          chmod 600 /home/vagrant/.ssh/vagrant_rsa
          chown vagrant:vagrant /home/vagrant/.ssh/vagrant_rsa

          # --- Install Ansible via pip (gets a modern version) ---------------
          if ! command -v ansible-playbook &> /dev/null; then
            echo "Installing Ansible..."
            export DEBIAN_FRONTEND=noninteractive
            apt-get update -qq
            apt-get install -y -qq python3-pip sshpass > /dev/null 2>&1
            pip3 install --quiet ansible
          else
            echo "Ansible already installed: $(ansible-playbook --version | head -1)"
          fi

          # --- Run the Kubernetes cluster playbook ---------------------------
          echo "============================================="
          echo "  Running Ansible playbook..."
          echo "============================================="
          cd /home/vagrant/ansible
          su - vagrant -c "
            cd /home/vagrant/ansible && \
            ANSIBLE_HOST_KEY_CHECKING=false \
            ansible-playbook \
              -i inventory.ini \
              playbook.yml \
              --become \
              -v
          "
        SHELL
      end

    end
  end
end
```

**Line-by-line explanation:**
- `if index == NODES.length - 1`: Only run on the **last VM** (services). This guarantees all other VMs are already up.
- `node.vm.provision "file"`: Upload files from your host into the VM. We upload the entire `ansible/` directory and the SSH key.
- `~/.vagrant.d/insecure_private_keys/vagrant.key.rsa`: The shared SSH key Vagrant uses for all VMs (because we set `insert_key = false`).
- `chmod 600`: SSH requires private keys to have strict permissions.
- `pip3 install ansible`: Install Ansible via Python (gets a modern version, more reliable than the system package).
- `ANSIBLE_HOST_KEY_CHECKING=false`: Don't ask "Are you sure you want to connect?" for each SSH connection.
- `--become`: Run tasks with sudo privileges.
- `-v`: Verbose output so you can see what's happening.

> **Key insight:** The services VM acts as the "Ansible control node." It connects to k8s-master, k8s-worker1, and k8s-worker2 over the private network (`192.168.56.x`) using the shared Vagrant SSH key.

---

## Chapter 3: Ansible Fundamentals — Automating Server Configuration

### What is Ansible?

Ansible is a tool that lets you describe the desired state of a server in YAML files, and it makes it happen. Instead of manually running 50 commands on each server, you write them once and Ansible executes them on all servers simultaneously.

**Key concepts:**
- **Inventory**: A list of servers and their connection details
- **Playbook**: A YAML file that describes what to do (a sequence of "plays")
- **Role**: A reusable unit of automation (like a function in programming)
- **Task**: A single action (install a package, copy a file, run a command)
- **Handler**: A task that only runs when triggered (e.g., restart a service after config changes)

### Step 3.1: Create the Directory Structure

```bash
mkdir -p ansible/roles/{common,containerd,kubernetes,master,workers,cni}/{tasks,handlers}
mkdir -p ansible/group_vars
```

This creates:
```
ansible/
├── roles/
│   ├── common/tasks/       common/handlers/
│   ├── containerd/tasks/   containerd/handlers/
│   ├── kubernetes/tasks/
│   ├── master/tasks/
│   ├── workers/tasks/
│   └── cni/tasks/
└── group_vars/
```

### Step 3.2: Write the Inventory File

Create `ansible/inventory.ini`:

```ini
# =============================================================================
# Ansible Inventory — Kubernetes Cluster
# =============================================================================

# ---------- Master node ------------------------------------------------------
[masters]
k8s-master  ansible_host=192.168.56.10 ansible_user=vagrant ansible_ssh_private_key_file=/home/vagrant/.ssh/vagrant_rsa

# ---------- Worker nodes -----------------------------------------------------
[workers]
k8s-worker1 ansible_host=192.168.56.11 ansible_user=vagrant ansible_ssh_private_key_file=/home/vagrant/.ssh/vagrant_rsa
k8s-worker2 ansible_host=192.168.56.12 ansible_user=vagrant ansible_ssh_private_key_file=/home/vagrant/.ssh/vagrant_rsa

# ---------- Services node (Ansible control, NFS, Gitea, Jenkins, Nexus) ------
# NOT a Kubernetes node. Swap remains enabled. No K8s roles applied.
[services]
services    ansible_host=192.168.56.20 ansible_user=vagrant ansible_ssh_private_key_file=/home/vagrant/.ssh/vagrant_rsa

# ---------- Kubernetes nodes (masters + workers) — swap disabled -------------
[k8s_nodes:children]
masters
workers

# ---------- All nodes --------------------------------------------------------
[all:vars]
ansible_python_interpreter=/usr/bin/python3
ansible_ssh_common_args='-o StrictHostKeyChecking=no'
```

**Line-by-line explanation:**
- `[masters]`: Defines a group called "masters" containing one host.
- `ansible_host=192.168.56.10`: The IP address Ansible uses to connect via SSH.
- `ansible_user=vagrant`: SSH username.
- `ansible_ssh_private_key_file=...`: Path to the SSH key **on the services VM** (where Ansible runs).
- `[k8s_nodes:children]`: A **group of groups**. `k8s_nodes` = `masters` + `workers`. This lets us apply roles to all K8s nodes at once without including the services VM.
- `[all:vars]`: Variables applied to every host.
- `ansible_python_interpreter=/usr/bin/python3`: Ansible needs Python on remote hosts. This tells it where to find it.
- `StrictHostKeyChecking=no`: Don't prompt for SSH fingerprint confirmation.

### Step 3.3: Write the Group Variables

Create `ansible/group_vars/all.yml`:

```yaml
# =============================================================================
# Group Variables — Applied to ALL hosts
# =============================================================================
---

# ---------- Kubernetes version -----------------------------------------------
# Pinned to a specific stable release to ensure reproducibility.
kube_version: "1.29.2-1.1"
kube_major_version: "1.29"

# ---------- Networking -------------------------------------------------------
# Pod network CIDR — required by Flannel (hardcoded expectation).
pod_network_cidr: "10.244.0.0/16"

# Master node IP — used as the API server advertise address.
master_ip: "192.168.56.10"

# ---------- Kubernetes APT repository ----------------------------------------
kube_apt_key_url: "https://pkgs.k8s.io/core:/stable:/v{{ kube_major_version }}/deb/Release.key"
kube_apt_repo: "deb [signed-by=/etc/apt/keyrings/kubernetes-apt-keyring.gpg] https://pkgs.k8s.io/core:/stable:/v{{ kube_major_version }}/deb/ /"

# ---------- Flannel CNI manifest ---------------------------------------------
flannel_manifest_url: "https://github.com/flannel-io/flannel/releases/latest/download/kube-flannel.yml"

# ---------- Common prerequisite packages --------------------------------------
common_packages:
  - apt-transport-https
  - ca-certificates
  - curl
  - gnupg
  - lsb-release
  - software-properties-common

# ---------- Node hostnames & IPs (for /etc/hosts) ----------------------------
cluster_hosts:
  - { hostname: "k8s-master",  ip: "192.168.56.10" }
  - { hostname: "k8s-worker1", ip: "192.168.56.11" }
  - { hostname: "k8s-worker2", ip: "192.168.56.12" }
  - { hostname: "services",    ip: "192.168.56.20" }
```

**Line-by-line explanation:**
- `kube_version: "1.29.2-1.1"`: The exact Debian package version. Pinning prevents one node from getting a newer version than another.
- `kube_major_version: "1.29"`: Used to build the APT repository URL (the repo is organized by major version).
- `pod_network_cidr: "10.244.0.0/16"`: The IP range for pods. Flannel **requires** this exact CIDR — it's hardcoded in Flannel's configuration.
- `master_ip: "192.168.56.10"`: The API server will advertise this address. Workers use it to connect.
- `{{ kube_major_version }}`: Jinja2 template syntax. Ansible replaces this with the variable value at runtime.
- `common_packages`: List of APT packages needed on every node. These are standard Linux utilities for HTTPS, certificates, and package management.
- `cluster_hosts`: Used to populate `/etc/hosts` on every node so they can resolve each other by hostname.

### Step 3.4: Write the Main Playbook

Create `ansible/playbook.yml`:

```yaml
# =============================================================================
# Play 1 — Prepare all Kubernetes nodes (common + containerd + kubernetes)
# =============================================================================
- name: Prepare Kubernetes nodes
  hosts: k8s_nodes
  become: true
  gather_facts: true
  roles:
    - role: common
    - role: containerd
    - role: kubernetes

# =============================================================================
# Play 2 — Initialize the control plane and install CNI
# =============================================================================
- name: Initialize Kubernetes control plane
  hosts: masters
  become: true
  gather_facts: false
  roles:
    - role: master
    - role: cni

# =============================================================================
# Play 3 — Join worker nodes to the cluster
# =============================================================================
- name: Join worker nodes to the cluster
  hosts: workers
  become: true
  gather_facts: false
  roles:
    - role: workers

# =============================================================================
# Play 4 — Validate the cluster
# =============================================================================
- name: Validate Kubernetes cluster
  hosts: masters
  become: false
  gather_facts: false
  tasks:
    - name: Wait for all nodes to be Ready
      ansible.builtin.shell: |
        kubectl get nodes --no-headers | grep -v " Ready " | wc -l
      register: not_ready_count
      until: not_ready_count.stdout | trim | int == 0
      retries: 60
      delay: 10
      changed_when: false

    - name: Get node status
      ansible.builtin.command: kubectl get nodes -o wide
      register: nodes_output
      changed_when: false

    - name: Display node status
      ansible.builtin.debug:
        msg: "{{ nodes_output.stdout_lines }}"

    - name: Get pod status across all namespaces
      ansible.builtin.command: kubectl get pods -A -o wide
      register: pods_output
      changed_when: false

    - name: Display pod status
      ansible.builtin.debug:
        msg: "{{ pods_output.stdout_lines }}"
```

**Play-by-play explanation:**

- **Play 1** (`hosts: k8s_nodes`): Runs on master + both workers. Applies 3 roles: `common` (Linux prerequisites), `containerd` (container runtime), `kubernetes` (K8s packages). `become: true` means run as root. `gather_facts: true` means collect system information (OS, IP, etc.).

- **Play 2** (`hosts: masters`): Runs only on the master. Initializes the control plane (`kubeadm init`) and deploys Flannel networking. This **must** happen before workers can join.

- **Play 3** (`hosts: workers`): Runs on both workers. Each worker joins the cluster using a token generated by the master in Play 2.

- **Play 4** (`hosts: masters`): Validation. Waits for all nodes to report `Ready` status (retries 60 times, 10 seconds apart = up to 10 minutes). Then displays the cluster status.

> **Why is the order important?** Workers can't join until the master is initialized. The CNI must be deployed on the master before workers can become Ready. Ansible plays execute sequentially, which is exactly what we need.

---

## Chapter 4: The Common Role — Preparing Linux for Kubernetes

### Why does Linux need preparation?

Kubernetes has specific requirements for the Linux kernel. Out-of-the-box Ubuntu won't work because:
1. **Swap must be disabled** — Kubernetes manages memory itself and swap interferes with resource limits
2. **Specific kernel modules** must be loaded for container networking
3. **IP forwarding** must be enabled so pods can communicate across nodes
4. All nodes must be able to **resolve each other by hostname**

### Step 4.1: Write the Common Tasks

Create `ansible/roles/common/tasks/main.yml`:

```yaml
# =============================================================================
# Role: common — System prerequisites for Kubernetes nodes
# =============================================================================
---

# ---------- 1. Disable swap (runtime) ----------------------------------------
- name: Check if swap is active
  ansible.builtin.command: swapon --show
  register: swap_status
  changed_when: false
  failed_when: false

- name: Disable swap (runtime)
  ansible.builtin.command: swapoff -a
  when: swap_status.stdout | length > 0
  changed_when: true
```

**Explanation:**
- `swapon --show`: Lists active swap partitions. If output is empty, swap is already off.
- `register: swap_status`: Saves the command output into a variable.
- `changed_when: false`: Tells Ansible "this command doesn't change anything" (it's just a check).
- `swapoff -a`: Disables all swap immediately. `-a` means "all swap spaces."
- `when: swap_status.stdout | length > 0`: Only run if swap was actually active (idempotent).

> **Why disable swap?** The kubelet (Kubernetes agent) refuses to start if swap is enabled. Kubernetes uses cgroups to enforce memory limits per pod. If a pod is allowed to swap, those limits become meaningless.

```yaml
# ---------- 2. Disable swap (persistent — remove from fstab) -----------------
- name: Remove swap entries from /etc/fstab
  ansible.builtin.lineinfile:
    path: /etc/fstab
    regexp: '^\s*[^#].*\sswap\s'
    state: absent
  register: fstab_swap
```

**Explanation:**
- `/etc/fstab` is the file that tells Linux what to mount at boot. If there's a swap entry, Linux will re-enable swap on reboot.
- `regexp`: Matches any uncommented line containing "swap."
- `state: absent`: Remove matching lines.
- This ensures swap stays off even after a reboot.

```yaml
# ---------- 3. Load required kernel modules ----------------------------------
- name: Load kernel module — overlay
  ansible.builtin.command: modprobe overlay
  changed_when: false

- name: Load kernel module — br_netfilter
  ansible.builtin.command: modprobe br_netfilter
  changed_when: false
```

**Explanation:**
- `modprobe` loads a kernel module into the running kernel.
- **overlay**: Required by containerd. It enables the OverlayFS filesystem, which is how container images layer on top of each other.
- **br_netfilter**: Required for Kubernetes networking. It allows iptables rules to work on bridge traffic (traffic between containers on the same node).

```yaml
# ---------- 4. Persist kernel modules across reboots -------------------------
- name: Persist kernel modules in /etc/modules-load.d/k8s.conf
  ansible.builtin.copy:
    dest: /etc/modules-load.d/k8s.conf
    content: |
      # Kubernetes required kernel modules
      overlay
      br_netfilter
    owner: root
    group: root
    mode: "0644"
```

**Explanation:**
- `modprobe` only loads modules for the current session. To persist across reboots, we create a file in `/etc/modules-load.d/`.
- The `|` symbol means "multi-line string" in YAML.

```yaml
# ---------- 5. Configure sysctl parameters for Kubernetes networking ----------
- name: Configure sysctl parameters for Kubernetes
  ansible.builtin.copy:
    dest: /etc/sysctl.d/k8s.conf
    content: |
      # Kubernetes networking requirements
      net.bridge.bridge-nf-call-iptables  = 1
      net.bridge.bridge-nf-call-ip6tables = 1
      net.ipv4.ip_forward                 = 1
    owner: root
    group: root
    mode: "0644"
  notify: Reload sysctl

- name: Apply sysctl parameters immediately
  ansible.builtin.command: sysctl --system
  changed_when: false
```

**Explanation:**
- `sysctl` configures kernel parameters at runtime.
- **net.bridge.bridge-nf-call-iptables = 1**: Makes bridged traffic (container-to-container) pass through iptables rules. Without this, Kubernetes Services and NetworkPolicies won't work.
- **net.bridge.bridge-nf-call-ip6tables = 1**: Same for IPv6.
- **net.ipv4.ip_forward = 1**: Allows the node to forward network packets between interfaces. Essential for routing pod traffic.
- `notify: Reload sysctl`: Triggers the handler (defined in `handlers/main.yml`) to apply changes.
- `sysctl --system`: Applies all sysctl files immediately (don't wait for reboot).

```yaml
# ---------- 6. Install prerequisite packages ----------------------------------
- name: Update apt cache
  ansible.builtin.apt:
    update_cache: true
    cache_valid_time: 3600

- name: Install common prerequisite packages
  ansible.builtin.apt:
    name: "{{ common_packages }}"
    state: present
```

**Explanation:**
- `update_cache: true`: Runs `apt-get update` to refresh the package index.
- `cache_valid_time: 3600`: Don't update if it was updated less than 1 hour ago (performance optimization).
- `"{{ common_packages }}"`: References the list from `group_vars/all.yml`. Ansible installs all of them.
- `state: present`: Install if not already installed (idempotent).

```yaml
# ---------- 7. Populate /etc/hosts with cluster node entries ------------------
- name: Add cluster host entries to /etc/hosts
  ansible.builtin.lineinfile:
    path: /etc/hosts
    regexp: '.*\s{{ item.hostname }}$'
    line: "{{ item.ip }}  {{ item.hostname }}"
    state: present
  loop: "{{ cluster_hosts }}"
```

**Explanation:**
- `/etc/hosts` maps hostnames to IP addresses (like a local DNS).
- `loop: "{{ cluster_hosts }}"`: Iterates over the list from `group_vars/all.yml`.
- For each entry, it adds a line like `192.168.56.10  k8s-master`.
- `regexp`: If the hostname already exists, replace the line (instead of duplicating it).
- After this, any node can `ping k8s-master` by name instead of IP.

### Step 4.2: Write the Common Handler

Create `ansible/roles/common/handlers/main.yml`:

```yaml
# =============================================================================
# Handlers: common
# =============================================================================
---

- name: Reload sysctl
  ansible.builtin.command: sysctl --system
  changed_when: true
```

**Explanation:**
- Handlers only run when **notified** by a task (the `notify: Reload sysctl` line in step 5).
- They run **once** at the end of the role, even if multiple tasks notify them.
- This reloads all sysctl configuration files.

---

## Chapter 5: The Containerd Role — Installing the Container Runtime

### What is a Container Runtime?

Kubernetes doesn't run containers directly. It delegates to a **container runtime** — software that knows how to pull images and start/stop containers.

- **Docker** was the original runtime, but Kubernetes deprecated Docker support in v1.24.
- **containerd** is the industry standard. It's what Docker uses internally, but without Docker's extra features.
- Kubernetes communicates with containerd through the **CRI (Container Runtime Interface)**.

### Step 5.1: Write the Containerd Tasks

Create `ansible/roles/containerd/tasks/main.yml`:

```yaml
# =============================================================================
# Role: containerd — Install and configure the container runtime
# =============================================================================
---

# ---------- 1. Install containerd --------------------------------------------
- name: Install containerd package
  ansible.builtin.apt:
    name: containerd
    state: present
    update_cache: true
    cache_valid_time: 3600
```

**Explanation:** Installs containerd from Ubuntu's default repositories.

```yaml
# ---------- 2. Ensure config directory exists ---------------------------------
- name: Create /etc/containerd directory
  ansible.builtin.file:
    path: /etc/containerd
    state: directory
    owner: root
    group: root
    mode: "0755"
```

**Explanation:** The configuration directory might not exist yet. `state: directory` creates it if missing.

```yaml
# ---------- 3. Generate default containerd config ----------------------------
- name: Generate default containerd config
  ansible.builtin.shell: containerd config default > /etc/containerd/config.toml
  args:
    creates: /etc/containerd/config.toml
  notify: Restart containerd
```

**Explanation:**
- `containerd config default` generates a full default configuration file.
- `creates: /etc/containerd/config.toml`: Only run if this file doesn't exist yet (idempotent).
- `notify: Restart containerd`: The handler will restart containerd after changes.

```yaml
# ---------- 4. Enable SystemdCgroup in containerd config ----------------------
- name: Enable SystemdCgroup in containerd config
  ansible.builtin.replace:
    path: /etc/containerd/config.toml
    regexp: 'SystemdCgroup\s*=\s*false'
    replace: 'SystemdCgroup = true'
  notify: Restart containerd
```

**Explanation:**
- **This is critical!** By default, containerd uses the `cgroupfs` cgroup driver. But Kubernetes uses `systemd` as its cgroup driver.
- If they don't match, pods will fail to start with mysterious errors.
- This task finds the line `SystemdCgroup = false` and changes it to `true`.

> **What are cgroups?** Control Groups (cgroups) are a Linux kernel feature that limits how much CPU, memory, and I/O a process can use. Kubernetes uses cgroups to enforce resource limits on pods. The cgroup "driver" is how those limits are managed — either directly (cgroupfs) or through systemd.

```yaml
# ---------- 5. Enable and start containerd service ----------------------------
- name: Enable and start containerd
  ansible.builtin.systemd:
    name: containerd
    state: started
    enabled: true
    daemon_reload: true
```

**Explanation:**
- `state: started`: Start the service now.
- `enabled: true`: Start it automatically on boot.
- `daemon_reload: true`: Reload systemd configuration (picks up any service file changes).

### Step 5.2: Write the Containerd Handler

Create `ansible/roles/containerd/handlers/main.yml`:

```yaml
# =============================================================================
# Handlers: containerd
# =============================================================================
---

- name: Restart containerd
  ansible.builtin.systemd:
    name: containerd
    state: restarted
    daemon_reload: true
```

**Explanation:** Restarts the containerd service. Triggered when configuration changes.

---

## Chapter 6: The Kubernetes Role — Installing K8s Packages

### What are kubeadm, kubelet, and kubectl?

These are the three core Kubernetes binaries:

| Tool | What it does | Where it runs |
|---|---|---|
| **kubeadm** | Bootstraps the cluster (init master, join workers) | Used once per node during setup |
| **kubelet** | The node agent — communicates with the API server and manages pods | Runs permanently on every node |
| **kubectl** | CLI tool for humans to interact with the cluster | Used on the master (or any machine with access) |

### Step 6.1: Write the Kubernetes Tasks

Create `ansible/roles/kubernetes/tasks/main.yml`:

```yaml
# =============================================================================
# Role: kubernetes — Install kubeadm, kubelet, kubectl from official repo
# =============================================================================
---

# ---------- 1. Create keyrings directory --------------------------------------
- name: Ensure /etc/apt/keyrings directory exists
  ansible.builtin.file:
    path: /etc/apt/keyrings
    state: directory
    owner: root
    group: root
    mode: "0755"
```

**Explanation:** APT stores GPG keys in `/etc/apt/keyrings/`. This directory verifies that packages come from a trusted source.

```yaml
# ---------- 2. Download Kubernetes GPG signing key ----------------------------
- name: Download Kubernetes apt signing key
  ansible.builtin.shell: |
    curl -fsSL {{ kube_apt_key_url }} | gpg --dearmor -o /etc/apt/keyrings/kubernetes-apt-keyring.gpg
  args:
    creates: /etc/apt/keyrings/kubernetes-apt-keyring.gpg
```

**Explanation:**
- Downloads the GPG key from the official Kubernetes package repository.
- `gpg --dearmor`: Converts the key from ASCII format to binary (required by APT).
- `creates:`: Only download if the file doesn't exist yet.
- `{{ kube_apt_key_url }}` resolves to `https://pkgs.k8s.io/core:/stable:/v1.29/deb/Release.key`.

```yaml
# ---------- 3. Add Kubernetes apt repository ----------------------------------
- name: Add Kubernetes apt repository
  ansible.builtin.apt_repository:
    repo: "{{ kube_apt_repo }}"
    filename: kubernetes
    state: present
    update_cache: true
```

**Explanation:**
- Adds the official Kubernetes package repository to APT.
- `{{ kube_apt_repo }}` resolves to `deb [signed-by=...] https://pkgs.k8s.io/core:/stable:/v1.29/deb/ /`.
- `update_cache: true`: Runs `apt-get update` after adding the repo.

```yaml
# ---------- 4. Install kubelet, kubeadm, kubectl at pinned version -----------
- name: Install kubelet
  ansible.builtin.apt:
    name: "kubelet={{ kube_version }}"
    state: present
    allow_downgrade: true

- name: Install kubeadm
  ansible.builtin.apt:
    name: "kubeadm={{ kube_version }}"
    state: present
    allow_downgrade: true

- name: Install kubectl
  ansible.builtin.apt:
    name: "kubectl={{ kube_version }}"
    state: present
    allow_downgrade: true
```

**Explanation:**
- Installs each package at the **exact version** specified in `group_vars/all.yml` (`1.29.2-1.1`).
- `allow_downgrade: true`: If a newer version was somehow installed, downgrade to our pinned version.

> **Why pin the version?** In Kubernetes, the master and workers must run compatible versions. If `apt upgrade` accidentally updates kubelet on one worker, it could break the cluster.

```yaml
# ---------- 5. Hold packages to prevent unintended upgrades -------------------
- name: Hold kubelet package
  ansible.builtin.dpkg_selections:
    name: kubelet
    selection: hold

- name: Hold kubeadm package
  ansible.builtin.dpkg_selections:
    name: kubeadm
    selection: hold

- name: Hold kubectl package
  ansible.builtin.dpkg_selections:
    name: kubectl
    selection: hold
```

**Explanation:**
- `dpkg --set-selections hold`: Marks packages as "held" — `apt upgrade` will skip them.
- This is the Debian/Ubuntu equivalent of "locking" a package version.

```yaml
# ---------- 6. Enable kubelet service -----------------------------------------
- name: Enable kubelet service
  ansible.builtin.systemd:
    name: kubelet
    enabled: true
```

**Explanation:**
- Enables kubelet to start on boot. Note: we don't `start` it yet — kubeadm will start it during initialization.

---

## Chapter 7: The Master Role — Initializing the Control Plane

### What happens during `kubeadm init`?

When you run `kubeadm init` on the master node, it:
1. Generates SSL certificates for secure communication
2. Starts **etcd** (the cluster database)
3. Starts the **API server**, **scheduler**, and **controller manager**
4. Configures **kubelet** on the master
5. Generates a **join token** that workers use to authenticate

### Step 7.1: Write the Master Tasks

Create `ansible/roles/master/tasks/main.yml`:

```yaml
# =============================================================================
# Role: master — Initialize the Kubernetes control plane
# =============================================================================
---

# ---------- 1. Check if the cluster is already initialized --------------------
- name: Check if Kubernetes is already initialized
  ansible.builtin.stat:
    path: /etc/kubernetes/admin.conf
  register: kubeadm_init_check
```

**Explanation:**
- `stat` checks if a file exists.
- `/etc/kubernetes/admin.conf` is created by `kubeadm init`. If it exists, the cluster is already initialized.
- This makes the role **idempotent** — running it twice won't break anything.

```yaml
# ---------- 2. Initialize the control plane -----------------------------------
- name: Run kubeadm init
  ansible.builtin.command: >
    kubeadm init
    --apiserver-advertise-address={{ master_ip }}
    --pod-network-cidr={{ pod_network_cidr }}
    --node-name={{ inventory_hostname }}
  when: not kubeadm_init_check.stat.exists
  register: kubeadm_init_result
```

**Explanation:**
- `kubeadm init`: The main command that creates the Kubernetes control plane.
- `--apiserver-advertise-address={{ master_ip }}`: Tells the API server to listen on `192.168.56.10` (the private network IP). Without this, it might listen on the NAT interface, which workers can't reach.
- `--pod-network-cidr={{ pod_network_cidr }}`: Tells Kubernetes that pods will use the `10.244.0.0/16` range. This must match what Flannel expects.
- `--node-name={{ inventory_hostname }}`: Sets the node name to `k8s-master` (from the inventory).
- `when: not kubeadm_init_check.stat.exists`: Skip if already initialized.

> **This is the moment the cluster is born.** After this command, you have a working (but lonely) Kubernetes master with no workers and no networking.

```yaml
# ---------- 3. Configure kubectl for the vagrant user -------------------------
- name: Create .kube directory for vagrant user
  ansible.builtin.file:
    path: /home/vagrant/.kube
    state: directory
    owner: vagrant
    group: vagrant
    mode: "0755"

- name: Copy admin.conf to vagrant user's .kube/config
  ansible.builtin.copy:
    src: /etc/kubernetes/admin.conf
    dest: /home/vagrant/.kube/config
    remote_src: true
    owner: vagrant
    group: vagrant
    mode: "0600"
```

**Explanation:**
- `kubeadm init` creates `/etc/kubernetes/admin.conf` — this file contains the credentials to talk to the API server.
- kubectl looks for its config at `~/.kube/config`.
- We copy `admin.conf` to the `vagrant` user's home directory so they can run `kubectl` without sudo.
- `remote_src: true`: The source file is on the same machine (not on the Ansible control node).
- `mode: "0600"`: Only the owner can read this file (it contains credentials!).

```yaml
# ---------- 4. Generate and store the join command ----------------------------
- name: Generate cluster join command
  ansible.builtin.command: kubeadm token create --print-join-command
  register: join_command_result
  changed_when: false

- name: Store join command as a host fact
  ansible.builtin.set_fact:
    kube_join_command: "{{ join_command_result.stdout }}"
```

**Explanation:**
- `kubeadm token create --print-join-command`: Generates a new token and prints the full `kubeadm join` command that workers need.
- The output looks like: `kubeadm join 192.168.56.10:6443 --token abc123.xyz --discovery-token-ca-cert-hash sha256:...`
- `set_fact`: Stores this as an Ansible variable (`kube_join_command`) that can be accessed by other plays via `hostvars['k8s-master']['kube_join_command']`.

> **This is how the master and workers communicate during setup.** The master generates a secret token, and Ansible passes it to the workers. No manual copy-paste needed!

```yaml
# ---------- 5. Debug — print join command (for verification) ------------------
- name: Display join command
  ansible.builtin.debug:
    msg: "{{ kube_join_command }}"
```

**Explanation:** Prints the join command in the Ansible output so you can verify it was generated correctly.

---

## Chapter 8: The CNI Role — Pod Networking with Flannel

### What is a CNI and why do we need it?

After `kubeadm init`, you have a control plane, but **pods on different nodes can't talk to each other**. Kubernetes doesn't implement networking itself — it delegates to a **CNI (Container Network Interface)** plugin.

**Flannel** is one of the simplest CNI plugins. It creates an **overlay network**: a virtual network that spans all nodes. Each node gets a subnet (e.g., `10.244.0.0/24`, `10.244.1.0/24`), and Flannel handles routing packets between them.

```
Node 1 (10.244.0.0/24)          Node 2 (10.244.1.0/24)
┌─────────────────────┐         ┌─────────────────────┐
│ Pod A: 10.244.0.5   │ ──────> │ Pod B: 10.244.1.8   │
│                     │ Flannel │                     │
│                     │ overlay │                     │
└─────────────────────┘         └─────────────────────┘
```

### Step 8.1: Write the CNI Tasks

Create `ansible/roles/cni/tasks/main.yml`:

```yaml
# =============================================================================
# Role: cni — Install Flannel CNI plugin
# =============================================================================
---

# ---------- 1. Check if Flannel is already deployed ---------------------------
- name: Check if Flannel DaemonSet exists
  ansible.builtin.command: >
    kubectl get daemonset kube-flannel-ds
    --namespace=kube-flannel
    --kubeconfig=/home/vagrant/.kube/config
  register: flannel_check
  changed_when: false
  failed_when: false
  become: false
```

**Explanation:**
- Checks if Flannel is already running in the cluster (idempotent).
- A **DaemonSet** is a Kubernetes resource that ensures one pod runs on every node. Flannel uses this to deploy its network agent on each node.
- `failed_when: false`: Don't treat "not found" as a failure — it just means Flannel isn't installed yet.
- `become: false`: Run as the vagrant user (not root), because kubectl uses the vagrant user's config.

```yaml
# ---------- 2. Download and patch Flannel manifest ----------------------------
- name: Download Flannel manifest
  ansible.builtin.get_url:
    url: "{{ flannel_manifest_url }}"
    dest: /tmp/kube-flannel.yml
    mode: "0644"
  when: flannel_check.rc != 0
  become: false

- name: Patch Flannel manifest to use correct interface (enp0s8)
  ansible.builtin.replace:
    path: /tmp/kube-flannel.yml
    regexp: '(- --kube-subnet-mgr)'
    replace: '\1\n        - --iface=enp0s8'
  when: flannel_check.rc != 0
  become: false
```

**Explanation:**
- Downloads the official Flannel manifest (a YAML file that describes all Kubernetes resources Flannel needs).
- **The patch is critical!** VirtualBox VMs have two network interfaces:
  - `enp0s3`: NAT interface (for internet access) — all VMs get the same IP (10.0.2.15)
  - `enp0s8`: Host-only interface (our private network) — unique IPs (192.168.56.x)
- By default, Flannel uses the first interface, which is NAT. All nodes would appear to have the same IP, and networking would fail.
- `--iface=enp0s8` tells Flannel to use the private network interface instead.
- `\1` in the replacement is a regex back-reference (keeps the original line and adds the new flag after it).

```yaml
# ---------- 3. Apply patched Flannel manifest ---------------------------------
- name: Apply Flannel CNI manifest
  ansible.builtin.command: >
    kubectl apply -f /tmp/kube-flannel.yml
    --kubeconfig=/home/vagrant/.kube/config
  when: flannel_check.rc != 0
  become: false
```

**Explanation:**
- `kubectl apply -f`: Creates all resources defined in the YAML file (Namespace, ServiceAccount, ConfigMap, DaemonSet, etc.).
- This deploys Flannel pods to every node in the cluster.

```yaml
# ---------- 4. Wait for Flannel pods to be ready ------------------------------
- name: Wait for Flannel DaemonSet to be available
  ansible.builtin.command: >
    kubectl rollout status daemonset/kube-flannel-ds
    --namespace=kube-flannel
    --timeout=300s
    --kubeconfig=/home/vagrant/.kube/config
  changed_when: false
  become: false
```

**Explanation:**
- `kubectl rollout status`: Blocks until the DaemonSet is fully deployed (all pods running).
- `--timeout=300s`: Wait up to 5 minutes. Flannel needs to download its image and start on each node.
- Once Flannel is running, pods can communicate across nodes.

---

## Chapter 9: The Workers Role — Joining Nodes to the Cluster

### How does a worker join the cluster?

The join process is:
1. The worker runs `kubeadm join` with the master's address and a secret token
2. The worker contacts the master's API server and presents the token
3. The master validates the token and the CA certificate hash
4. The master registers the worker as a new node
5. kubelet on the worker starts and begins accepting pod assignments

### Step 9.1: Write the Workers Tasks

Create `ansible/roles/workers/tasks/main.yml`:

```yaml
# =============================================================================
# Role: workers — Join worker nodes to the Kubernetes cluster
# =============================================================================
---

# ---------- 1. Check if already joined the cluster ----------------------------
- name: Check if node has already joined the cluster
  ansible.builtin.stat:
    path: /etc/kubernetes/kubelet.conf
  register: kubelet_conf_check
```

**Explanation:**
- `/etc/kubernetes/kubelet.conf` is created when a node joins a cluster.
- If it exists, the node is already joined — skip the join command (idempotent).

```yaml
# ---------- 2. Join the cluster -----------------------------------------------
- name: Join worker node to the cluster
  ansible.builtin.command: "{{ hostvars['k8s-master']['kube_join_command'] }}"
  when: not kubelet_conf_check.stat.exists
  register: join_result
```

**Explanation:**
- `hostvars['k8s-master']['kube_join_command']`: This is the magic of Ansible. It accesses the `kube_join_command` variable that was set on the master node in Play 2.
- The command looks like: `kubeadm join 192.168.56.10:6443 --token <token> --discovery-token-ca-cert-hash sha256:<hash>`
- `when: not kubelet_conf_check.stat.exists`: Only join if not already joined.

> **Why is this dynamic?** Join tokens expire after 24 hours. By generating a fresh token during each provisioning run, we ensure the join always works, even if you destroy and recreate the cluster.

```yaml
# ---------- 3. Debug — print join result (for verification) -------------------
- name: Display join result
  ansible.builtin.debug:
    msg: "Worker {{ inventory_hostname }} joined the cluster successfully."
  when: join_result is changed
```

**Explanation:** Confirms the join was successful. `inventory_hostname` is the node's name from the inventory (e.g., `k8s-worker1`).

---

## Chapter 10: Validation & Your First Deployment

### Step 10.1: Run `vagrant up`

With all files in place, run:

```bash
vagrant up
```

This single command:
1. Downloads the Ubuntu 22.04 image (first time only)
2. Creates all 4 VMs
3. Installs Ansible on the services VM
4. Runs the entire playbook (K8s cluster + services: NFS, Gitea, Nexus, Jenkins)
5. Gives you a working Kubernetes cluster with a full CI/CD stack

**Expected duration:** 15-30 minutes (depending on internet speed and hardware).

### Step 10.2: Verify the Cluster

SSH into the master node:

```bash
vagrant ssh k8s-master
```

Check that all nodes are `Ready`:

```bash
kubectl get nodes -o wide
```

**Expected output:**
```
NAME          STATUS   ROLES           AGE   VERSION   INTERNAL-IP      OS-IMAGE
k8s-master    Ready    control-plane   10m   v1.29.2   192.168.56.10   Ubuntu 22.04.3 LTS
k8s-worker1   Ready    <none>          8m    v1.29.2   192.168.56.11   Ubuntu 22.04.3 LTS
k8s-worker2   Ready    <none>          8m    v1.29.2   192.168.56.12   Ubuntu 22.04.3 LTS
```

Check that all system pods are running:

```bash
kubectl get pods -A
```

You should see pods for: `coredns`, `etcd`, `kube-apiserver`, `kube-controller-manager`, `kube-scheduler`, `kube-proxy`, and `kube-flannel-ds`.

### Step 10.3: Deploy Your First Application

Let's deploy an Nginx web server to prove the cluster works:

```bash
# Create a deployment with 3 replicas
kubectl create deployment nginx --image=nginx --replicas=3

# Watch the pods being scheduled across nodes
kubectl get pods -o wide -w

# Expose it as a NodePort service
kubectl expose deployment nginx --port=80 --type=NodePort

# Get the assigned port
kubectl get svc nginx
```

You should see 3 Nginx pods distributed across your worker nodes. Access the service from your host browser at `http://192.168.56.11:<NodePort>`.

### Step 10.4: Useful kubectl Commands

| Command | What it does |
|---|---|
| `kubectl get nodes` | List all nodes and their status |
| `kubectl get pods -A` | List all pods in all namespaces |
| `kubectl get pods -o wide` | List pods with node assignment |
| `kubectl describe pod <name>` | Detailed info about a specific pod |
| `kubectl logs <pod-name>` | View pod logs |
| `kubectl delete deployment nginx` | Delete the deployment |
| `kubectl top nodes` | Show resource usage per node (requires metrics-server) |

### Step 10.5: Clean Up

```bash
# Stop all VMs (preserves data)
vagrant halt

# Destroy all VMs (deletes everything)
vagrant destroy -f

# Recreate from scratch
vagrant up
```

---

## Glossary

| Term | Definition |
|---|---|
| **Pod** | The smallest deployable unit in Kubernetes. Contains one or more containers. |
| **Node** | A machine (VM or physical) in the Kubernetes cluster. |
| **Control Plane** | The set of components that manage the cluster (API server, etcd, scheduler, controller). |
| **kubelet** | Agent running on each node. Manages containers as instructed by the API server. |
| **kubeadm** | Tool to bootstrap a Kubernetes cluster. |
| **kubectl** | Command-line tool to interact with the Kubernetes API. |
| **etcd** | Distributed key-value store that holds all cluster state. |
| **CNI** | Container Network Interface — plugin system for pod networking. |
| **Flannel** | A simple CNI plugin that creates an overlay network for pod communication. |
| **DaemonSet** | A Kubernetes resource that runs one pod on every node. |
| **Service** | An abstraction that exposes a set of pods as a network service. |
| **Namespace** | A way to divide cluster resources between multiple users/teams. |
| **Overlay Network** | A virtual network built on top of the physical network. |
| **CRI** | Container Runtime Interface — how Kubernetes talks to container runtimes. |
| **cgroup** | Linux kernel feature for resource limiting (CPU, memory) per process group. |
| **sysctl** | Linux utility to configure kernel parameters at runtime. |
| **Idempotent** | Running an operation multiple times produces the same result as running it once. |
| **NFS** | Network File System — allows sharing directories over a network. Used for Kubernetes persistent storage. |
| **Gitea** | A lightweight, self-hosted Git service. Alternative to GitHub/GitLab for local use. |
| **Nexus** | Sonatype Nexus Repository Manager — stores Docker images and other artifacts. |
| **Jenkins** | An open-source CI/CD automation server for building, testing, and deploying code. |
| **Docker Compose** | A tool to define and run multi-container Docker applications from a YAML file. |
| **PersistentVolume (PV)** | A piece of storage in the cluster provisioned by an administrator (e.g., NFS share). |

---

> **Congratulations!** You have built a production-style Kubernetes cluster from scratch. You now understand what every component does and why it's needed. This knowledge is foundational for any DevOps, Cloud, or Platform Engineering career.
