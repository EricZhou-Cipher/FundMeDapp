const { ethers, artifacts, network } = require("hardhat");

async function main() {
  const [deployer] = await ethers.getSigners();
  console.log("Deploying with account:", deployer.address);

  // 部署测试代币
  const TestToken = await ethers.getContractFactory("TestToken");
  const token = await TestToken.deploy(
    "TestToken",
    "TT",
    ethers.parseEther("1000000")
  );
  await token.waitForDeployment();
  console.log("TestToken deployed to:", token.target);

  // 获取当前最新区块时间戳
  const latestBlock = await network.provider.send("eth_getBlockByNumber", [
    "latest",
    false,
  ]);
  const currentTimestamp = Number(latestBlock.timestamp);
  console.log("当前区块时间戳:", currentTimestamp);

  // 用户期望设置的时间戳（示例：1741150221）
  // 注意：必须大于当前区块的时间戳，否则会报错
  let desiredTimestamp = 1741150221;
  if (desiredTimestamp <= currentTimestamp) {
    console.log("期望时间戳小于当前区块时间戳，自动设置为当前时间戳+10秒");
    desiredTimestamp = currentTimestamp + 10;
  }

  // 设置下一个区块的时间戳
  await network.provider.send("evm_setNextBlockTimestamp", [desiredTimestamp]);
  await network.provider.send("evm_mine");
  console.log("已设置新区块时间戳为：", desiredTimestamp);

  // 部署 FundMe（示例参数：目标100 ETH，持续60秒，锁定30秒）
  const FundMe = await ethers.getContractFactory("FundMe");
  const goal = ethers.parseEther("100");
  const duration = 60; // 60 seconds fundraising duration
  const lockPeriod = 30; // 30 seconds withdraw lock
  const fundMe = await FundMe.deploy(goal, duration, lockPeriod);
  await fundMe.waitForDeployment();
  console.log("FundMe deployed to:", fundMe.target);

  // 将合约地址和ABI写入前端
  const fs = require("fs");
  const contractsDir = __dirname + "/../frontend/constants";
  if (!fs.existsSync(contractsDir)) {
    fs.mkdirSync(contractsDir, { recursive: true });
  }

  const addresses = { FundMe: fundMe.target, TestToken: token.target };
  fs.writeFileSync(
    contractsDir + "/contract-address.json",
    JSON.stringify(addresses, null, 2)
  );

  const FundMeArtifact = await artifacts.readArtifact("FundMe");
  fs.writeFileSync(
    contractsDir + "/FundMe.json",
    JSON.stringify(FundMeArtifact, null, 2)
  );
  const TokenArtifact = await artifacts.readArtifact("TestToken");
  fs.writeFileSync(
    contractsDir + "/TestToken.json",
    JSON.stringify(TokenArtifact, null, 2)
  );

  console.log("Deployment data saved to frontend/constants/");
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
