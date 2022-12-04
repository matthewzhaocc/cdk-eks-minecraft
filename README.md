# Deploy Minecraft from AWS EKS

This project utilizes terraform CDK to deploy Minecraft to AWS EKS.

requirement:
node > 16
terraform > 0.10
kubectl > 1.21

To bootstrap this project:

`npm install -g cdktf-cli@latest`

`cdktf deploy cdk-eks-network cdk-eks-iam cdk-eks-cluster cdk-eks-cluster-setup`

`aws eks update-kubeconfig --region us-west-1 --name minecraft-cluster`

`kubectl get services -n minecraft`
