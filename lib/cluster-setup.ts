import { Construct } from "constructs";
import { TerraformStack } from "cdktf";

import { AwsProvider } from "@cdktf/provider-aws/lib/provider";
import {
  dataAwsCallerIdentity,
  eksAddon,
  iamRole,
  iamRolePolicyAttachment,
} from "@cdktf/provider-aws";
import { HelmProvider } from "@cdktf/provider-helm/lib/provider";
import { Release } from "@cdktf/provider-helm/lib/release";
import { KubernetesProvider } from "@cdktf/provider-kubernetes/lib/provider";
import { serviceAccount } from "@cdktf/provider-kubernetes";

export class ClusterSetupStack extends TerraformStack {
  constructor(
    scope: Construct,
    id: string,
    clusterName: string,
    clusterArn: string,
    albPolicyArn: string,
    clusterIssuer: string
  ) {
    super(scope, id);

    new AwsProvider(this, "aws-provider", {
      region: process.env.AWS_REGION || "us-west-1",
    });

    new KubernetesProvider(this, "kubernetes-provider", {
      configPath: "~/.kube/config",
      configContext: clusterArn,
    });

    new HelmProvider(this, "helm-provider", {
      kubernetes: {
        configPath: "~/.kube/config",
        configContext: clusterArn,
      },
    });

    new eksAddon.EksAddon(this, "vpc-cni", {
      clusterName,
      addonName: "vpc-cni",
    });

    new eksAddon.EksAddon(this, "ebs-driver", {
      clusterName,
      addonName: "aws-ebs-csi-driver",
    });

    const me = new dataAwsCallerIdentity.DataAwsCallerIdentity(
      this,
      "caller-id"
    );

    const stringEquals: any = {};
    stringEquals[`${clusterIssuer}:aud`] = "sts.amazonaws.com";
    stringEquals[`${clusterIssuer}:sub`] =
      "system:serviceaccount:kube-system:aws-load-balancer-controller";

    const albRole = new iamRole.IamRole(this, "eks-alb-role", {
      name: "AmazonEKSLoadBalancerControllerRole",
      assumeRolePolicy: JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: {
              Federated: `arn:aws:iam::${me.accountId}:oidc-provider/oidc.eks.${
                process.env.AWS_REGION || "us-west-1"
              }.amazonaws.com/id/${clusterIssuer.split("https://")[1]}`,
            },
            Action: "sts:AssumeRoleWithWebIdentity",
            Condition: {
              StringEquals: stringEquals,
            },
          },
        ],
      }),
    });
    new iamRolePolicyAttachment.IamRolePolicyAttachment(
      this,
      "alb-policy-eks",
      {
        role: albRole.id,
        policyArn: albPolicyArn,
      }
    );

    const albSvcAccLabels: any = {};
    albSvcAccLabels["app.kubernetes.io/component"] = "controller";
    albSvcAccLabels["app.kubernetes.io/name"] = "aws-load-balancer-controller";
    const albIamAnnotations: any = {};
    albIamAnnotations["eks.amazonaws.com/role-arn"] = albRole.arn;
    const albSvcAcc = new serviceAccount.ServiceAccount(this, "alb-svc-acc", {
      metadata: {
        labels: albSvcAccLabels,
        name: "aws-load-balancer-controller",
        namespace: "kube-system",
        annotations: albIamAnnotations,
      },
    });

    new Release(this, "eks-alb-controller", {
      repository: "https://aws.github.io/eks-charts",
      name: "aws-load-balancer-controller",
      namespace: "kube-system",
      set: [
        { name: "clusterName", value: clusterName },
        { name: "serviceAccount.create", value: "false" },
        { name: "serviceAccount.name", value: albSvcAcc.metadata.name },
      ],

      chart: "aws-load-balancer-controller",
    });

    new Release(this, "minecraftzzzz", {
      repository: "https://itzg.github.io/minecraft-server-charts/",
      name: "minecraft",
      set: [
        { name: "minecraftServer.eula", value: "true" },
        { name: "persistence.dataDir.enabled", value: "true" },
      ],
      namespace: "minecraft",
      createNamespace: true,
      chart: "minecraft",
    });
  }
}
