data "aws_ami" "amazon_linux_2023" {
  most_recent = true
  owners      = ["amazon"]

  filter {
    name   = "name"
    values = ["al2023-ami-2023.*-x86_64"]
  }
}

# ============================================
# KMS Key for encryption
# ============================================

resource "aws_kms_key" "secrets" {
  description             = "KMS key for encrypting RDS secrets in ${var.project_name} ${var.environment}"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-secrets-key-${var.environment}"
  })
}

resource "aws_kms_alias" "secrets" {
  name          = "alias/${var.project_name}-secrets-${var.environment}"
  target_key_id = aws_kms_key.secrets.key_id
}

# ============================================
# Secrets Manager - store RDS credentials
# ============================================

resource "aws_secretsmanager_secret" "rds" {
  name                    = "${var.project_name}/rds/${var.environment}"
  description             = "RDS PostgreSQL credentials for ${var.project_name} ${var.environment}"
  recovery_window_in_days = 0
  kms_key_id              = aws_kms_key.secrets.id

  tags = var.common_tags
}

resource "aws_secretsmanager_secret_version" "rds" {
  secret_id = aws_secretsmanager_secret.rds.id

  secret_string = jsonencode({
    username = var.rds_master_username
    password = var.rds_master_password
    host     = aws_db_instance.main.address
    port     = aws_db_instance.main.port
    dbname   = aws_db_instance.main.db_name
    engine   = "postgres"
    url      = "postgresql://${var.rds_master_username}:${var.rds_master_password}@${aws_db_instance.main.address}:${aws_db_instance.main.port}/${aws_db_instance.main.db_name}"
  })
}

# ============================================
# DB Subnet Group
# ============================================

resource "aws_db_subnet_group" "main" {
  name        = "${var.project_name}-db-subnet-group-${var.environment}"
  description = "DB Subnet Group for ${var.project_name} ${var.environment}"
  subnet_ids  = var.private_db_subnet_ids

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-db-subnet-group-${var.environment}"
  })
}

# ============================================
# RDS PostgreSQL Instance
# ============================================

resource "aws_db_instance" "main" {
  identifier = "${var.project_name}-postgres-${var.environment}"

  engine         = "postgres"
  engine_version = "15"

  instance_class        = var.rds_instance_class
  allocated_storage     = var.rds_allocated_storage
  max_allocated_storage = var.rds_allocated_storage * 2
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name  = "smarthiredb"
  username = var.rds_master_username
  password = var.rds_master_password

  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [var.rds_security_group_id]
  publicly_accessible    = false
  multi_az               = false

  deletion_protection = false
  skip_final_snapshot = true

  backup_retention_period = 7
  backup_window           = "03:00-04:00"
  maintenance_window      = "sun:05:00-sun:06:00"
  copy_tags_to_snapshot   = true

  iam_database_authentication_enabled = true
  auto_minor_version_upgrade          = true

  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-postgres-${var.environment}"
  })
}

# ============================================
# Bastion Host
# ============================================

resource "aws_security_group" "bastion" {
  name        = "${var.project_name}-bastion-sg-${var.environment}"
  description = "Security group for Bastion Host"
  vpc_id      = var.vpc_id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-bastion-sg-${var.environment}"
  })
}

resource "aws_security_group_rule" "bastion_ssh" {
  type              = "ingress"
  from_port         = 22
  to_port           = 22
  protocol          = "tcp"
  cidr_blocks       = [var.bastion_ssh_cidr]
  security_group_id = aws_security_group.bastion.id
  description       = "SSH access"
}

resource "aws_security_group_rule" "bastion_egress_all" {
  type              = "egress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = ["0.0.0.0/0"]
  security_group_id = aws_security_group.bastion.id
  description       = "Allow all outbound"
}

resource "aws_instance" "bastion" {
  ami               = data.aws_ami.amazon_linux_2023.id
  instance_type     = "t3.micro"
  subnet_id         = var.public_subnet_id
  key_name          = var.bastion_key_pair != "" ? var.bastion_key_pair : null
  source_dest_check = var.enable_bastion_nat_instance ? false : true

  vpc_security_group_ids = [aws_security_group.bastion.id]

  user_data = <<-EOF
    #!/bin/bash
    set -euxo pipefail

    dnf update -y
    dnf install -y postgresql15

    %{if var.enable_bastion_nat_instance}
    dnf install -y iptables iptables-services

    cat <<'SCRIPT' > /usr/local/bin/configure-nat.sh
    #!/bin/bash
    set -euo pipefail
    
    # 1. Enable IP Forwarding
    sysctl -w net.ipv4.ip_forward=1
    grep -q '^net.ipv4.ip_forward=1$' /etc/sysctl.conf || echo 'net.ipv4.ip_forward=1' >> /etc/sysctl.conf

    # 1.1. Disable rp_filter to avoid dropping forwarded packets
    # (rp_filter can break NAT/forwarding in some asymmetric routing cases)
    sysctl -w net.ipv4.conf.all.rp_filter=0
    sysctl -w net.ipv4.conf.default.rp_filter=0
    
    # 2. Detect Primary Network Interface (Nitro instances often use ens5 instead of eth0)
    PRIMARY_IF=$(ip route | grep default | awk '{print $5}' | head -n 1)
    if [ -z "$PRIMARY_IF" ]; then
        echo "ERROR: Could not detect primary network interface. Falling back to eth0."
        PRIMARY_IF="eth0"
    fi
    echo "Configuring NAT MASQUERADE on interface: $PRIMARY_IF"
    
    # 3. Apply NAT rules
    # Wipe out any default REJECT rules that AL2023 or firewalld/iptables-services might install
    iptables -F FORWARD
    iptables -P FORWARD ACCEPT
    
    iptables -t nat -F POSTROUTING
    iptables -t nat -A POSTROUTING -o "$PRIMARY_IF" -j MASQUERADE
    
    # Save rules to survive reboot (optional but safe)
    iptables-save > /etc/sysconfig/iptables
    
    # 4. Success check
    iptables -t nat -L POSTROUTING -v -n
    SCRIPT

    chmod +x /usr/local/bin/configure-nat.sh
    /usr/local/bin/configure-nat.sh

    cat <<'UNIT' > /etc/systemd/system/configure-nat.service
    [Unit]
    Description=Configure NAT forwarding on bastion
    After=network-online.target
    Wants=network-online.target

    [Service]
    Type=oneshot
    ExecStart=/usr/local/bin/configure-nat.sh
    RemainAfterExit=yes

    [Install]
    WantedBy=multi-user.target
    UNIT

    systemctl daemon-reload
    systemctl enable configure-nat.service
    %{endif}
  EOF

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-bastion-${var.environment}"
  })
}

resource "aws_eip" "bastion" {
  instance = aws_instance.bastion.id
  domain   = "vpc"

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-bastion-eip-${var.environment}"
  })
}

resource "aws_security_group_rule" "rds_ingress_bastion" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.bastion.id
  security_group_id        = var.rds_security_group_id
  description              = "PostgreSQL from Bastion Security Group"
}

resource "aws_security_group_rule" "bastion_ingress_private_nat" {
  count = var.enable_bastion_nat_instance ? 1 : 0

  type              = "ingress"
  from_port         = 0
  to_port           = 0
  protocol          = "-1"
  cidr_blocks       = var.private_db_subnet_cidrs
  security_group_id = aws_security_group.bastion.id
  description       = "Allow private subnets to forward traffic through bastion NAT"
}

# ============================================
# RDS Proxy — Connection pooling for Lambda
# ============================================

resource "aws_db_proxy" "main" {
  count = var.enable_rds_proxy ? 1 : 0

  name                   = "${var.project_name}-rds-proxy-${var.environment}"
  debug_logging          = var.environment != "prod"
  engine_family          = "POSTGRESQL"
  idle_client_timeout    = 1800
  require_tls            = true
  role_arn               = aws_iam_role.rds_proxy[0].arn
  vpc_security_group_ids = [aws_security_group.rds_proxy[0].id]
  vpc_subnet_ids         = var.private_db_subnet_ids

  auth {
    auth_scheme = "SECRETS"
    description = "RDS credentials from Secrets Manager"
    iam_auth    = "REQUIRED"
    secret_arn  = aws_secretsmanager_secret.rds.arn
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-rds-proxy-${var.environment}"
  })
}

resource "aws_db_proxy_default_target_group" "main" {
  count = var.enable_rds_proxy ? 1 : 0

  db_proxy_name = aws_db_proxy.main[0].name

  connection_pool_config {
    connection_borrow_timeout    = 120
    max_connections_percent      = 100
    max_idle_connections_percent = 50
  }
}

resource "aws_db_proxy_target" "main" {
  count = var.enable_rds_proxy ? 1 : 0

  db_instance_identifier = aws_db_instance.main.identifier
  db_proxy_name          = aws_db_proxy.main[0].name
  target_group_name      = aws_db_proxy_default_target_group.main[0].name
}

# ============================================
# RDS Proxy — IAM Role
# ============================================

resource "aws_iam_role" "rds_proxy" {
  count = var.enable_rds_proxy ? 1 : 0

  name = "${var.project_name}-rds-proxy-role-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Action    = "sts:AssumeRole"
      Effect    = "Allow"
      Principal = { Service = "rds.amazonaws.com" }
    }]
  })

  tags = var.common_tags
}

resource "aws_iam_role_policy" "rds_proxy_secrets" {
  count = var.enable_rds_proxy ? 1 : 0

  name = "rds-proxy-secrets-access"
  role = aws_iam_role.rds_proxy[0].name

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue"
        ]
        Resource = aws_secretsmanager_secret.rds.arn
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = aws_kms_key.secrets.arn
      }
    ]
  })
}

# ============================================
# RDS Proxy — Security Group
# ============================================

resource "aws_security_group" "rds_proxy" {
  count = var.enable_rds_proxy ? 1 : 0

  name        = "${var.project_name}-rds-proxy-sg-${var.environment}"
  description = "Security group for RDS Proxy"
  vpc_id      = var.vpc_id

  ingress {
    description     = "PostgreSQL from Lambda/App"
    from_port       = 5432
    to_port         = 5432
    protocol        = "tcp"
    security_groups = [var.app_security_group_id]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-rds-proxy-sg-${var.environment}"
  })
}

# Allow RDS Proxy to connect to RDS
resource "aws_security_group_rule" "rds_ingress_proxy" {
  count = var.enable_rds_proxy ? 1 : 0

  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.rds_proxy[0].id
  security_group_id        = var.rds_security_group_id
  description              = "PostgreSQL from RDS Proxy"
}
