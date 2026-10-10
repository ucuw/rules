#!/bin/bash
# 服务器初始化脚本（修复版）：需要以 root 身份运行（sudo bash oracle.sh）
# 可重复运行（幂等），不会重复插入配置

export DEBIAN_FRONTEND=noninteractive

if [ "$EUID" -ne 0 ]; then
  echo "请用 root 权限运行：sudo bash $0"
  exit 1
fi

echo "===== 第一步：开启 root 密钥登录，清除开屏信息 ====="
SRC_KEY=""
for f in /home/ubuntu/.ssh/authorized_keys /root/.ssh/authorized_keys; do
  if [ -s "$f" ]; then SRC_KEY="$f"; break; fi
done
if [ -z "$SRC_KEY" ]; then
  echo "错误：找不到非空的 authorized_keys，为避免锁死自己，脚本终止。"
  exit 1
fi

mkdir -p /root/.ssh
if [ "$SRC_KEY" != "/root/.ssh/authorized_keys" ]; then
  cp "$SRC_KEY" /root/.ssh/authorized_keys
fi
chown -R root:root /root/.ssh
chmod 700 /root/.ssh
chmod 600 /root/.ssh/authorized_keys

# 用 00- 前缀的 drop-in 配置（sshd 以先出现的值为准，可覆盖 50-cloud-init.conf）
mkdir -p /etc/ssh/sshd_config.d
cat > /etc/ssh/sshd_config.d/00-custom.conf << 'EOF'
PermitRootLogin prohibit-password
PasswordAuthentication no
PrintLastLog no
EOF
# 同时修改主配置
sed -i "s/^#\{0,1\}PermitRootLogin.*/PermitRootLogin prohibit-password/" /etc/ssh/sshd_config
sed -i "s/^#\{0,1\}PasswordAuthentication.*/PasswordAuthentication no/" /etc/ssh/sshd_config

# cloud-init 不再禁用 root
if grep -q "^disable_root" /etc/cloud/cloud.cfg 2>/dev/null; then
  sed -i "s/^disable_root:.*/disable_root: false/" /etc/cloud/cloud.cfg
else
  echo "disable_root: false" >> /etc/cloud/cloud.cfg
fi

# 清除开屏信息
chmod -x /etc/update-motd.d/* 2>/dev/null
truncate -s 0 /etc/motd 2>/dev/null
sed -i "/pam_motd/ { /^#/! s/^/#/ }" /etc/pam.d/sshd
sed -i "/pam_motd/ { /^#/! s/^/#/ }" /etc/pam.d/login

# 先校验配置再重启，避免配置错误导致 SSH 起不来
if sshd -t; then
  systemctl restart ssh
  echo "第一步完成（请另开终端测试 root 密钥登录，成功前不要关闭当前窗口）"
else
  echo "错误：sshd 配置校验失败，未重启 ssh，请检查配置。"
  exit 1
fi

echo "===== 第二步：清理 + 卸载 + 缓存清理 ====="
systemctl disable --now ModemManager.service fwupd.service open-vm-tools.service apport.service snap.oracle-cloud-agent.oracle-cloud-agent.service snap.oracle-cloud-agent.oracle-cloud-agent-updater.service 2>/dev/null
snap remove oracle-cloud-agent 2>/dev/null
apt-get update
apt-get purge -y fwupd modemmanager open-vm-tools apport
apt-get autoremove -y
apt-get clean
rm -rf /var/cache/fwupd/* /var/cache/swcatalog/*
echo "第二步完成"

echo "===== 第三步：限制日志大小 ====="
sed -i 's/^#\?SystemMaxUse=.*/SystemMaxUse=100M/; s/^#\?RuntimeMaxUse=.*/RuntimeMaxUse=50M/' /etc/systemd/journald.conf
systemctl restart systemd-journald
journalctl --vacuum-size=100M

# 仅在系统装有 rsyslog 时才配置 logrotate，避免 postrotate 脚本不存在而报错
if [ -x /usr/lib/rsyslog/rsyslog-rotate ]; then
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
else
  echo "未检测到 rsyslog，跳过 logrotate 配置（日志由 journald 管理）"
fi
echo "第三步完成"

echo "===== 第四步：安装 fail2ban ====="
apt-get update
apt-get install -y fail2ban
tee /etc/fail2ban/jail.local > /dev/null << 'EOF'
[DEFAULT]
bantime = 24h
findtime = 10m
maxretry = 5
backend = systemd

[sshd]
enabled = true
EOF
systemctl enable fail2ban
systemctl restart fail2ban
sleep 3
if systemctl is-active --quiet fail2ban; then
  fail2ban-client status sshd
else
  echo "警告：fail2ban 未能启动，请执行 journalctl -u fail2ban -n 30 --no-pager 查看原因"
fi
echo "第四步完成"

echo "===== 第五步：修改 DNS ====="
for f in /etc/netplan/*.yaml; do
  [ -f "$f" ] || continue
  if grep -q "dhcp4-overrides" "$f"; then
    echo "$f 已配置过，跳过"
    continue
  fi
  cp "$f" "$f.bak.$(date +%Y%m%d%H%M%S)"
  # 自动沿用原有缩进，在 dhcp4: true 之后一次性插入两段配置
  sed -i -E 's/^( *)dhcp4: true/&\n\1dhcp4-overrides:\n\1  use-dns: false\n\1  use-domains: false\n\1nameservers:\n\1  addresses: [8.8.8.8, 1.1.1.1]/' "$f"
  chmod 600 "$f"
done
# 备份文件移出 netplan 目录，避免被误读
mkdir -p /root/netplan-backup
mv /etc/netplan/*.bak.* /root/netplan-backup/ 2>/dev/null

netplan generate && netplan apply
resolvectl status
echo "第五步完成"
echo "===== 全部完成 ====="
