// Copyright (c) HashiCorp, Inc
// SPDX-License-Identifier: MPL-2.0
import { App, S3Backend } from "cdktf";
import { NetworkStack } from "./lib/network";
import { IamStack } from "./lib/iam";
import { ClusterStack } from "./lib/cluster";
import { ClusterSetupStack } from "./lib/cluster-setup";

const clusterName = "minecraft-cluster";

const app = new App();
const networkStack = new NetworkStack(app, "cdk-eks-network", clusterName);
const iamStack = new IamStack(app, "cdk-eks-iam");
const clusterStack = new ClusterStack(app, "cdk-eks-cluster", {
  clusterName,
  ctrlPlaneRole: iamStack.controlPlaneRole,
  workerRole: iamStack.workerRole,
  securityGroup: networkStack.secGroup,
  subnets: [
    networkStack.pubSub1,
    networkStack.pubSub2,
    networkStack.privSub1,
    networkStack.privSub2,
  ],
  privateSubnets: [networkStack.privSub1, networkStack.privSub2],
});
const clusterSetupStack = new ClusterSetupStack(
  app,
  "cdk-eks-cluster-setup",
  clusterName,
  clusterStack.clusterArn,
  iamStack.albPolicy,
  clusterStack.clusterIssuer
);

clusterSetupStack.addDependency(clusterStack);

new S3Backend(iamStack, {
  bucket: "matthewzhaocc-cdk-eks-minecraft",
  region: "us-west-1",
  key: "iam-stack.json",
});

new S3Backend(networkStack, {
  bucket: "matthewzhaocc-cdk-eks-minecraft",
  region: "us-west-1",
  key: "network-stack.json",
});

new S3Backend(clusterStack, {
  bucket: "matthewzhaocc-cdk-eks-minecraft",
  region: "us-west-1",
  key: "cluster-stack.json",
});

new S3Backend(clusterSetupStack, {
  bucket: "matthewzhaocc-cdk-eks-minecraft",
  region: "us-west-1",
  key: "cluster-setup-stack.json",
});

app.synth();
