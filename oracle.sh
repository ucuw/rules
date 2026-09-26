#!/bin/bash
# 服务器初始化脚本：需要以 root 身份运行（sudo bash oracle.sh）

if [ "$EUID" -ne 0 ]; then
  echo "请用 root 权限运行：sudo bash $0"
  exit 1
fi

echo "===== 第一步：开启 root 登录，清除开屏信息 ====="
mkdir -p /root/.ssh && \
cp /home/ubuntu/.ssh/authorized_keys /root/.ssh/authorized_keys && \
chown -R root:root /root/.ssh && \
chmod 700 /root/.ssh && \
chmod 600 /root/.ssh/authorized_keys && \
sed -i "s/^#\{0,1\}PermitRootLogin.*/PermitRootLogin prohibit-password/" /etc/ssh/sshd_config && \
sed -i "s/^#\{0,1\}PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config && \
(grep -q "^disable_root" /etc/cloud/cloud.cfg && sed -i "s/^disable_root:.*/disable_root: false/" /etc/cloud/cloud.cfg || echo "disable_root: false" >> /etc/cloud/cloud.cfg) && \
chmod -x /etc/update-motd.d/* && \
truncate -s 0 /etc/motd && \
sed -i "/pam_motd/ s/^/#/" /etc/pam.d/sshd && \
sed -i "/pam_motd/ s/^/#/" /etc/pam.d/login && \
systemctl restart ssh && \
echo "第一步完成"

echo "===== 第二步：清理 + 卸载 + 缓存清理 ====="
systemctl disable --now ModemManager.service fwupd.service open-vm-tools.service apport.service snap.oracle-cloud-agent.oracle-cloud-agent.service snap.oracle-cloud-agent.oracle-cloud-agent-updater.service 2>/dev/null
snap remove oracle-cloud-agent 2>/dev/null
apt purge -y fwupd modemmanager open-vm-tools apport
apt autoremove -y
apt clean
rm -rf /var/cache/fwupd/* /var/cache/swcatalog/*
echo "第二步完成"

echo "===== 第三步：限制日志大小 ====="
sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=100M/; s/^#\?RuntimeMaxUse=.*/RuntimeMaxUse=50M/' /etc/systemd/journald.conf
systemctl restart systemd-journald
journalctl --vacuum-size=100M
tee /etc/logrotate.d/rsyslog > /dev/null << 'EOF'
/var/log/syslog
/var/log/mail.log
/var/log/kern.log
/var/log/auth.log
/var/log/user.log
/var/log/cron.log
{
	rotate 7
	daily
	missingok
	notifempty
	compress
	delaycompress
	sharedscripts
	su root root
	size 50M
	postrotate
		/usr/lib/rsyslog/rsyslog-rotate
	endscript
}
EOF
logrotate -f /etc/logrotate.d/rsyslog
echo "第三步完成"

echo "===== 第四步：安装 fail2ban ====="
apt install -y fail2ban
tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 24h
findtime = 10m
maxretry = 5

[sshd]
enabled = true
EOF
systemctl enable --now fail2ban
systemctl restart fail2ban
echo "第四步完成"

echo "===== 第五步：修改 DNS，禁止 cloud-init 管理网络 ====="
sed -i '/dhcp4: true/a\      dhcp4-overrides:\n        use-dns: false\n        use-domains: false' /etc/netplan/*.yaml
sed -i '/mtu: 9000/a\      nameservers:\n        addresses: [8.8.8.8, 1.1.1.1]' /etc/netplan/*.yaml
netplan apply
resolvectl status
echo "第五步完成"

echo "全部完成！"
