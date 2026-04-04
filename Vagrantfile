# -*- mode: ruby -*-
# vi: set ft=ruby :
# =============================================================================
# Vagrantfile — Kubernetes Cluster (1 Master + 2 Workers + 1 Services VM)
# Provider:    VirtualBox
# OS:          Ubuntu 22.04 LTS (Jammy Jellyfish)
# Network:     192.168.56.0/24 (private host-only) + NAT
# Provisioner: Ansible (installed and run from the services VM)
# =============================================================================

# ---------- VM definitions ---------------------------------------------------
NODES = [
  { name: "k8s-master",  ip: "192.168.56.10", cpus: 2, memory: 4096 },
  { name: "k8s-worker1", ip: "192.168.56.11", cpus: 2, memory: 2048 },
  { name: "k8s-worker2", ip: "192.168.56.12", cpus: 2, memory: 2048 },
  { name: "services",    ip: "192.168.56.20", cpus: 2, memory: 4096 },
]

# ---------- Vagrant configuration --------------------------------------------
Vagrant.configure("2") do |config|

  # Base box for all VMs
  config.vm.box = "ubuntu/jammy64"

  # Increase boot timeout to handle resource contention with multiple VMs
  config.vm.boot_timeout = 600

  # Disable default synced folder for performance
  config.vm.synced_folder ".", "/vagrant", disabled: true

  # SSH — keep default insecure key so all VMs share the same keypair
  config.ssh.insert_key = false

  # ---------- Loop over each node definition ---------------------------------
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

      # ----- Provisioner (triggered on the LAST VM only) ---------------------
      # The services VM installs Ansible locally and runs the playbook against
      # all cluster nodes over the private network. This approach works on
      # Windows, macOS, and Linux hosts without requiring Ansible on the host.
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
