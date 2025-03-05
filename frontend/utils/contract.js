import { ethers } from "ethers";
import FundMe from "./FundMe.json";

const contractAddress = "0x5FbDB2315678afecb367f032d93F642f64180aa3";

async function getContract() {
  if (!window.ethereum) {
    throw new Error("请安装 MetaMask");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const signer = await provider.getSigner();
  return new ethers.Contract(contractAddress, FundMe.abi, signer);
}

export async function getProjectInfo() {
  const contract = await getContract();
  const state = await contract.state();
  const goal = await contract.goal();
  const deadline = await contract.deadline();
  const lockPeriod = await contract.lockPeriod();
  const totalRaised = await contract.totalRaisedCombined();
  const ended = Number(deadline) <= Math.floor(Date.now() / 1000);

  return {
    state: Number(state),
    raised: Number(ethers.formatEther(totalRaised)),
    goal: Number(ethers.formatEther(goal)),
    deadline: Number(deadline),
    lockPeriod: Number(lockPeriod),
    ended,
  };
}

export async function getUserStats(account) {
  const contract = await getContract();
  const donationCount = await contract.donationCount(account);
  const ethContribution = await contract.contributions(
    account,
    ethers.ZeroAddress
  );
  return {
    donationCount: Number(donationCount),
    ethContribution: Number(ethers.formatEther(ethContribution)),
  };
}

export async function getTopDonors() {
  const contract = await getContract();
  const topDonors = await contract.getTopDonors();
  const formattedTopDonors = topDonors.map((donor) => ({
    address: donor.donor,
    totalAmount: Number(ethers.formatEther(donor.totalAmount)),
  }));
  return formattedTopDonors;
}

export async function connectWallet() {
  if (!window.ethereum) {
    throw new Error("请安装 MetaMask");
  }
  const provider = new ethers.BrowserProvider(window.ethereum);
  const accounts = await provider.send("eth_requestAccounts", []);
  return accounts[0];
}

export async function fund(amountInEther) {
  if (
    !amountInEther ||
    isNaN(Number(amountInEther)) ||
    Number(amountInEther) <= 0
  ) {
    throw new Error("无效的资金金额");
  }

  const contract = await getContract();
  const amountInWei = ethers.parseEther(amountInEther);
  // 调用 donate 函数，传入地址 0 表示 ETH 捐款
  const tx = await contract.donate(ethers.ZeroAddress, 0, {
    value: amountInWei,
  });
  await tx.wait();
}

export async function claimRefund() {
  const contract = await getContract();
  const tx = await contract.refund(ethers.ZeroAddress);
  await tx.wait();
}
