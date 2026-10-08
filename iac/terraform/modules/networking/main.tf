data "aws_availability_zones" "available" {
  state = "available"
}

locals {
  endpoint_subnet_ids    = (var.environment == "dev" && var.endpoint_single_subnet_dev) ? [aws_subnet.private_db[var.endpoint_subnet_index].id] : aws_subnet.private_db[*].id
  use_prod_nat_gateway   = var.egress_mode == "nat_gateway"
  use_shared_bastion_nat = var.egress_mode == "shared_bastion_nat"
  private_rt_count       = local.use_prod_nat_gateway ? 2 : (local.use_shared_bastion_nat ? 1 : 0)
  nat_gateway_count      = local.use_prod_nat_gateway ? var.nat_gateway_az_count : 0
}

resource "aws_vpc" "main" {
  cidr_block           = "10.0.0.0/16"
  enable_dns_hostnames = true
  enable_dns_support   = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-vpc-${var.environment}"
  })
}

resource "aws_subnet" "public" {
  count                   = 2
  vpc_id                  = aws_vpc.main.id
  cidr_block              = "10.0.${count.index + 1}.0/24"
  availability_zone       = data.aws_availability_zones.available.names[count.index]
  map_public_ip_on_launch = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-public-subnet-${count.index + 1}-${var.environment}"
    Tier = "Public"
  })
}

resource "aws_subnet" "private_db" {
  count             = 2
  vpc_id            = aws_vpc.main.id
  cidr_block        = "10.0.${count.index + 10}.0/24"
  availability_zone = data.aws_availability_zones.available.names[count.index]

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-private-db-subnet-${count.index + 1}-${var.environment}"
    Tier = "PrivateDB"
  })
}

resource "aws_internet_gateway" "main" {
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-igw-${var.environment}"
  })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.main.id

  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.main.id
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-public-rt-${var.environment}"
  })
}

resource "aws_route_table_association" "public" {
  count          = 2
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_security_group" "app" {
  name        = "${var.project_name}-app-sg-${var.environment}"
  description = "Security group for application and Lambda functions"
  vpc_id      = aws_vpc.main.id

  ingress {
    description = "HTTPS from within VPC (VPC Endpoint responses)"
    from_port   = 443
    to_port     = 443
    protocol    = "tcp"
    cidr_blocks = [aws_vpc.main.cidr_block]
  }

  egress {
    description = "Allow all outbound"
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-app-sg-${var.environment}"
  })
}

resource "aws_security_group" "rds" {
  name        = "${var.project_name}-rds-sg-${var.environment}"
  description = "Security group for RDS PostgreSQL - allow only from app SG"
  vpc_id      = aws_vpc.main.id

  # No inline rules — all rules managed via aws_security_group_rule to avoid
  # conflicts with external rules (e.g. rds_ingress_bastion in database module)

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-rds-sg-${var.environment}"
  })
}

# Allow Lambda (app_sg) to reach RDS PostgreSQL
resource "aws_security_group_rule" "rds_ingress_app" {
  type                     = "ingress"
  from_port                = 5432
  to_port                  = 5432
  protocol                 = "tcp"
  source_security_group_id = aws_security_group.app.id
  security_group_id        = aws_security_group.rds.id
  description              = "PostgreSQL from Lambda/App Security Group"
}

# ============================================
# VPC Endpoints — allow Lambda in private subnet
# to reach AWS services without NAT Gateway
# ============================================

resource "aws_vpc_endpoint" "secretsmanager" {
  count               = var.enable_interface_endpoints ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.secretsmanager"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.app.id]
  private_dns_enabled = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-secretsmanager-endpoint-${var.environment}"
  })
}

resource "aws_vpc_endpoint" "cognito_idp" {
  count               = var.enable_interface_endpoints ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.cognito-idp"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.app.id]
  private_dns_enabled = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-cognito-idp-endpoint-${var.environment}"
  })
}

resource "aws_vpc_endpoint" "states" {
  count               = var.enable_interface_endpoints ? 1 : 0
  vpc_id              = aws_vpc.main.id
  service_name        = "com.amazonaws.${var.aws_region}.states"
  vpc_endpoint_type   = "Interface"
  subnet_ids          = local.endpoint_subnet_ids
  security_group_ids  = [aws_security_group.app.id]
  private_dns_enabled = true

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-states-endpoint-${var.environment}"
  })
}

resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids = concat(
    [aws_vpc.main.default_route_table_id, aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-s3-endpoint-${var.environment}"
  })
}

resource "aws_vpc_endpoint" "dynamodb" {
  vpc_id            = aws_vpc.main.id
  service_name      = "com.amazonaws.${var.aws_region}.dynamodb"
  vpc_endpoint_type = "Gateway"
  route_table_ids = concat(
    [aws_vpc.main.default_route_table_id, aws_route_table.public.id],
    aws_route_table.private[*].id
  )

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-dynamodb-endpoint-${var.environment}"
  })
}

# ============================================
# Private Route Tables for DB subnets
# ============================================

resource "aws_route_table" "private" {
  count  = local.private_rt_count
  vpc_id = aws_vpc.main.id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-private-rt-${count.index + 1}-${var.environment}"
  })
}

resource "aws_route_table_association" "private_db" {
  count          = length(aws_subnet.private_db)
  subnet_id      = aws_subnet.private_db[count.index].id
  route_table_id = local.use_prod_nat_gateway ? aws_route_table.private[count.index].id : aws_route_table.private[0].id
}

# ============================================
# NAT Gateway resources (prod only)
# ============================================

resource "aws_eip" "nat_gateway" {
  count  = local.nat_gateway_count
  domain = "vpc"

  depends_on = [aws_internet_gateway.main]

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-nat-eip-${count.index + 1}-${var.environment}"
  })
}

resource "aws_nat_gateway" "main" {
  count         = local.nat_gateway_count
  allocation_id = aws_eip.nat_gateway[count.index].id
  subnet_id     = aws_subnet.public[count.index].id

  tags = merge(var.common_tags, {
    Name = "${var.project_name}-nat-gw-${count.index + 1}-${var.environment}"
  })

  depends_on = [aws_internet_gateway.main]
}

resource "aws_route" "private_default_nat_gateway" {
  count                  = local.nat_gateway_count
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.main[count.index].id
}
