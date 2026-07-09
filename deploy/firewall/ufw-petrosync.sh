#!/usr/bin/env sh
set -eu

# Run as root on the pump controller after confirming the LAN subnet.
# Example: LAN_CIDR=192.168.1.0/24 sh deploy/firewall/ufw-petrosync.sh

LAN_CIDR="${LAN_CIDR:-192.168.1.0/24}"

ufw default deny incoming
ufw default allow outgoing

ufw allow from "$LAN_CIDR" to any port 80 proto tcp comment "PetroSync LAN HTTP"
ufw allow from "$LAN_CIDR" to any port 443 proto tcp comment "PetroSync LAN HTTPS"

# Optional remote administration. Prefer VPN; restrict SSH to a management subnet.
# ufw allow from 192.168.1.0/24 to any port 22 proto tcp comment "LAN SSH admin"

# Node.js and PostgreSQL must not be reachable from LAN clients.
ufw deny 5000/tcp comment "Block direct PetroSync backend"
ufw deny 5432/tcp comment "Block direct PostgreSQL"

ufw --force enable
ufw status verbose
