import { Construct } from "constructs";
import { TerraformStack } from "cdktf";

import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import {
  eksCluster,
  eksNodeGroup,
  dataAwsSsmParameter,
  iamOpenidConnectProvider,
} from "@cdktf/provider-aws";
import { dataTlsCertificate } from "@cdktf/provider-tls";
import { TlsProvider } from "@cdktf/provider-tls/lib/provider";

interface ClusterStackInput {
  subnets: string[];
  privateSubnets: string[];
  ctrlPlaneRole: string;
  workerRole: string;
  securityGroup: string;
  clusterName: string;
}

export class ClusterStack extends TerraformStack {
  public clusterArn: string;
  public clusterIssuer: string;
  constructor(scope: Construct, id: string, cfg: ClusterStackInput) {
    super(scope, id);

    new AwsProvider(this, "aws-provider", {
      region: process.env.AWS_REGION || "us-west-1",
    });

    new TlsProvider(this, "tls-provider");

    const cluster = new eksCluster.EksCluster(this, "mc-cluster", {
      name: cfg.clusterName,
      roleArn: cfg.ctrlPlaneRole,
      vpcConfig: {
        subnetIds: cfg.subnets,
        securityGroupIds: [cfg.securityGroup],
        endpointPrivateAccess: true,
        endpointPublicAccess: true,
      },
    });

    const eksAmiVersion = new dataAwsSsmParameter.DataAwsSsmParameter(
      this,
      "ami-id",
      {
        name: `/aws/service/eks/optimized-ami/${cluster.version}/amazon-linux-2/recommended/release_version`,
      }
    );

    new eksNodeGroup.EksNodeGroup(this, "default-node-group", {
      clusterName: cluster.name,
      nodeGroupName: "default-nodegroup",
      subnetIds: cfg.privateSubnets,
      scalingConfig: {
        desiredSize: 2,
        maxSize: 3,
        minSize: 1,
      },

      updateConfig: {
        maxUnavailable: 1,
      },

      version: cluster.version,
      releaseVersion: eksAmiVersion.value,
      nodeRoleArn: cfg.workerRole,
    });

    this.clusterArn = cluster.arn;

    const cert = new dataTlsCertificate.DataTlsCertificate(
      this,
      "iamOpenIdCertificate",
      {
        url: cluster.identity.get(0).oidc.get(0).issuer,
      }
    );

    new iamOpenidConnectProvider.IamOpenidConnectProvider(this, "eks-oidc", {
      thumbprintList: [cert.certificates.get(0).sha1Fingerprint],
      url: cluster.identity.get(0).oidc.get(0).issuer,
      clientIdList: ["sts.amazonaws.com"],
    });

    this.clusterIssuer = cluster.identity.get(0).oidc.get(0).issuer;
  }
}
