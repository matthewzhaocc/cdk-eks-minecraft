import { Construct } from "constructs";
import { TerraformStack, TerraformOutput } from "cdktf";

import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import {
  routeTableAssociation,
  internetGateway,
  routeTable,
  subnet,
  vpc,
  natGateway,
  eip,
  securityGroup,
  securityGroupRule,
} from "@cdktf/provider-aws";

export class NetworkStack extends TerraformStack {
  public vpc_: string;
  public pubSub1: string;
  public pubSub2: string;
  public privSub1: string;
  public privSub2: string;
  public secGroup: string;
  constructor(scope: Construct, id: string, clusterName: string) {
    super(scope, id);

    new AwsProvider(this, "aws-provider", {
      region: process.env.AWS_REGION || "us-west-1",
    });

    const vpc_ = new vpc.Vpc(this, "cluster-vpc", { cidrBlock: "10.0.0.0/16" });
    const pubSubNet1 = new subnet.Subnet(this, "pub-sub-1", {
      availabilityZone: "us-west-1c",
      vpcId: vpc_.id,
      cidrBlock: "10.0.0.0/24",
    });

    const pubSubNet2 = new subnet.Subnet(this, "pub-sub-2", {
      availabilityZone: "us-west-1b",
      vpcId: vpc_.id,
      cidrBlock: "10.0.1.0/24",
    });

    const privSub1 = new subnet.Subnet(this, "priv-sub-1", {
      availabilityZone: "us-west-1c",
      vpcId: vpc_.id,
      cidrBlock: "10.0.2.0/24",
    });

    const privSub2 = new subnet.Subnet(this, "priv-sub-2", {
      availabilityZone: "us-west-1b",
      vpcId: vpc_.id,
      cidrBlock: "10.0.3.0/24",
    });

    const igw = new internetGateway.InternetGateway(this, "vpc-igw", {
      vpcId: vpc_.id,
    });

    const publicRoutingTable = new routeTable.RouteTable(
      this,
      "public-routing-table",
      {
        vpcId: vpc_.id,
        route: [
          {
            gatewayId: igw.id,
            cidrBlock: "0.0.0.0/0",
          },
        ],
      }
    );

    const ctrlPlaneSgTags: any = {};
    ctrlPlaneSgTags[`kubernetes.io/cluster/${clusterName}`] = "owned";
    ctrlPlaneSgTags[`aws:eks:cluster-name`] = clusterName;

    const controlPlaneSecurityGroup = new securityGroup.SecurityGroup(
      this,
      "ctrl-plane-security-group",
      {
        vpcId: vpc_.id,
        tags: ctrlPlaneSgTags,
        lifecycle: {
          ignoreChanges: ["tags"],
        },
        egress: [
          {
            cidrBlocks: ["0.0.0.0/0"],
            fromPort: 0,
            toPort: 0,
            protocol: "TCP",
          },
        ],
      }
    );

    new securityGroupRule.SecurityGroupRule(this, "ingress-all-self", {
      securityGroupId: controlPlaneSecurityGroup.id,
      fromPort: 0,
      toPort: 0,
      type: "ingress",
      sourceSecurityGroupId: controlPlaneSecurityGroup.id,
      protocol: "TCP",
    });

    this.secGroup = controlPlaneSecurityGroup.id;

    new routeTableAssociation.RouteTableAssociation(this, "pub-sub-1-asso", {
      subnetId: pubSubNet1.id,
      routeTableId: publicRoutingTable.id,
    });

    new routeTableAssociation.RouteTableAssociation(this, "pub-sub-2-asso", {
      subnetId: pubSubNet2.id,
      routeTableId: publicRoutingTable.id,
    });

    const natGw1Eip = new eip.Eip(this, "nat-gw-1-eip");
    const natGw2Eip = new eip.Eip(this, "nat-gw-2-eip");

    const subnet1natGW = new natGateway.NatGateway(this, "natgw-sub-1", {
      subnetId: pubSubNet1.id,
      allocationId: natGw1Eip.id,
    });

    const subnet2natGW = new natGateway.NatGateway(this, "natgw-sub-2", {
      subnetId: pubSubNet2.id,
      allocationId: natGw2Eip.id,
    });

    const sub1RouteTable = new routeTable.RouteTable(this, "priv-sub-1-rt", {
      vpcId: vpc_.id,
      route: [
        {
          cidrBlock: "0.0.0.0/0",
          natGatewayId: subnet1natGW.id,
        },
      ],
    });

    const sub2RouteTable = new routeTable.RouteTable(this, "priv-sub-2-rt", {
      vpcId: vpc_.id,
      route: [
        {
          cidrBlock: "0.0.0.0/0",
          natGatewayId: subnet2natGW.id,
        },
      ],
    });

    new routeTableAssociation.RouteTableAssociation(this, "priv-sub-1-rta", {
      subnetId: privSub1.id,
      routeTableId: sub1RouteTable.id,
    });

    new routeTableAssociation.RouteTableAssociation(this, "priv-sub-2-rta", {
      subnetId: privSub2.id,
      routeTableId: sub2RouteTable.id,
    });

    new TerraformOutput(this, "vpc-id", {
      value: vpc_.id,
    });
    this.vpc_ = vpc_.id;
    this.pubSub1 = pubSubNet1.id;
    this.pubSub2 = pubSubNet2.id;
    this.privSub1 = privSub1.id;
    this.privSub2 = privSub2.id;

    new TerraformOutput(this, "pub-subnet-1-id", { value: pubSubNet1.id });
    new TerraformOutput(this, "pub-subnet-2-id", { value: pubSubNet2.id });
    new TerraformOutput(this, "priv-subnet-1-id", { value: privSub1.id });
    new TerraformOutput(this, "priv-subnet-2-id", { value: privSub2.id });
  }
}
