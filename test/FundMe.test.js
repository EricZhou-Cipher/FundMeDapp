const { expect } = require("chai");
const { ethers, network } = require("hardhat");

describe("FundMe", function () {
  let owner, donor1, donor2, donor3, attackerUser;
  let fundMe, token, attackerContract;
  const AddressZero = ethers.ZeroAddress;

  beforeEach(async function () {
    [owner, donor1, donor2, donor3, attackerUser] = await ethers.getSigners();
    // 部署测试代币合约并获取实例
    const TestToken = await ethers.getContractFactory("TestToken");
    token = await TestToken.deploy(
      "TestToken",
      "TT",
      ethers.parseEther("1000")
    );
    await token.waitForDeployment();
    // 部署 FundMe 合约，目标为 10 ETH，持续时间 7 天（604800秒），提款锁 1 小时（3600秒）
    const FundMe = await ethers.getContractFactory("FundMe");
    fundMe = await FundMe.deploy(ethers.parseEther("10"), 604800, 3600);
    await fundMe.waitForDeployment();
  });

  it("接受 ERC20 代币捐款并更新记录", async function () {
    // donor1 批准并捐赠 5 个 TestToken
    const amount = ethers.parseEther("5");
    await token.connect(donor1).approve(fundMe.address, amount);
    await expect(fundMe.connect(donor1).donate(token.address, amount))
      .to.emit(fundMe, "DonationReceived")
      .withArgs(donor1.address, token.address, amount);
    // 验证合约收到代币
    expect(await token.balanceOf(fundMe.address)).to.equal(amount);
    // 验证捐款映射更新
    const recorded = await fundMe.contributions(donor1.address, token.address);
    expect(recorded).to.equal(amount);
    expect(await fundMe.donationCount(donor1.address)).to.equal(1);
  });

  it("接受 ETH 捐款并更新记录", async function () {
    const ethAmount = ethers.parseEther("3");
    await expect(
      fundMe.connect(donor2).donate(AddressZero, 0, { value: ethAmount })
    )
      .to.emit(fundMe, "DonationReceived")
      .withArgs(donor2.address, AddressZero, ethAmount);
    expect(await fundMe.contributions(donor2.address, AddressZero)).to.equal(
      ethAmount
    );
    expect(await fundMe.totalEthRaised()).to.equal(ethAmount);
    expect(await fundMe.totalRaisedCombined()).to.equal(ethAmount);
  });

  it("多次捐款后排行榜正确排序", async function () {
    // 三位捐赠者捐款不同 ETH 数额
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("2") });
    await fundMe
      .connect(donor2)
      .donate(AddressZero, 0, { value: ethers.parseEther("5") });
    await fundMe
      .connect(donor3)
      .donate(AddressZero, 0, { value: ethers.parseEther("1") });
    // donor1 再次捐款 4 ETH，总计6 ETH
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("4") });
    const topList = await fundMe.getTopDonors();
    // 排行榜预期顺序： donor1 (6 ETH), donor2 (5 ETH), donor3 (1 ETH)
    expect(topList.length).to.be.gte(3);
    expect(topList[0].donor).to.equal(donor1.address);
    expect(topList[0].totalAmount).to.equal(ethers.parseEther("6"));
    expect(topList[1].donor).to.equal(donor2.address);
    expect(topList[1].totalAmount).to.equal(ethers.parseEther("5"));
    expect(topList[2].donor).to.equal(donor3.address);
    expect(topList[2].totalAmount).to.equal(ethers.parseEther("1"));
  });

  it("混合 ETH 和 ERC20 捐款在排行榜的合并计算", async function () {
    // donor1 捐 2 ETH，donor2 捐 5 个 TestToken
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("2") });
    const tokenAmount = ethers.parseEther("5");
    await token.connect(donor2).approve(fundMe.address, tokenAmount);
    await fundMe.connect(donor2).donate(token.address, tokenAmount);
    const topList = await fundMe.getTopDonors();
    // donor2 的 5 Token 应该高于 donor1 的 2 ETH
    expect(topList[0].donor).to.equal(donor2.address);
    expect(topList[0].totalAmount).to.equal(ethers.parseEther("5"));
    expect(topList[1].donor).to.equal(donor1.address);
    expect(topList[1].totalAmount).to.equal(ethers.parseEther("2"));
  });

  it("在截止日期前无法提款，在募集失败时禁止拥有者提款", async function () {
    // 募集中尝试提款应失败
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("1") });
    await expect(fundMe.withdraw(AddressZero)).to.be.revertedWith(
      "Campaign not successful"
    );
    // 时间推进到截止日期
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    // 未达到目标，先 finalize 设置状态为失败
    await fundMe.finalize();
    expect(await fundMe.state()).to.equal(2); // Failed
    // 募集失败状态下拥有者提款应被拒绝
    await expect(fundMe.withdraw(AddressZero)).to.be.revertedWith(
      "Campaign not successful"
    );
  });

  it("募集失败后捐款者可以退款", async function () {
    // donor1 捐款1 ETH，然后让活动失败
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("1") });
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    await fundMe.finalize();
    expect(await fundMe.state()).to.equal(2); // Failed
    // donor1 请求退款
    const prevBalance = await donor1.getBalance();
    const refundTx = await fundMe.connect(donor1).refund(AddressZero);
    await expect(refundTx)
      .to.emit(fundMe, "Refunded")
      .withArgs(donor1.address, AddressZero, ethers.parseEther("1"));
    const gasCost = (await refundTx.wait()).gasUsed.mul(refundTx.gasPrice);
    const newBalance = await donor1.getBalance();
    // 退款后余额增加约1 ETH（扣除 gas 费用）
    expect(newBalance.add(gasCost).sub(prevBalance)).to.equal(
      ethers.parseEther("1")
    );
    // 验证贡献记录清零
    expect(await fundMe.contributions(donor1.address, AddressZero)).to.equal(0);
    // 再次退款应失败（已无可退金额）
    await expect(fundMe.connect(donor1).refund(AddressZero)).to.be.revertedWith(
      "Nothing to refund"
    );
  });

  it("募集成功后捐款者无法退款", async function () {
    // 两人合计捐款达到目标
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("5") });
    await fundMe
      .connect(donor2)
      .donate(AddressZero, 0, { value: ethers.parseEther("5") });
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    await fundMe.finalize();
    expect(await fundMe.state()).to.equal(1); // Successful
    // 尝试退款应失败
    await expect(fundMe.connect(donor1).refund(AddressZero)).to.be.revertedWith(
      "Campaign not failed"
    );
  });

  it("强制执行提款的时间锁", async function () {
    // 达到筹款目标
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("10") });
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    await fundMe.finalize();
    expect(await fundMe.state()).to.equal(1);
    // 刚成功时（未过锁定时间）提款应锁定
    await expect(fundMe.withdraw(AddressZero)).to.be.revertedWith(
      "Withdrawal is time-locked"
    );
    // 时间推进锁定期1小时
    await network.provider.send("evm_increaseTime", [3600]);
    await network.provider.send("evm_mine");
    // 现在提款应成功，将合约内 ETH 转给拥有者
    const ownerBalanceBefore = await owner.getBalance();
    const tx = await fundMe.withdraw(AddressZero);
    const receipt = await tx.wait();
    const gasCost = receipt.gasUsed.mul(receipt.effectiveGasPrice);
    const ownerBalanceAfter = await owner.getBalance();
    expect(ownerBalanceAfter.add(gasCost).sub(ownerBalanceBefore)).to.equal(
      ethers.parseEther("10")
    );
  });

  it("只有拥有者可以提款，非拥有者调用将被拒", async function () {
    // 凑够目标金额
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("10") });
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    await fundMe.finalize();
    // 等待锁定期结束
    await network.provider.send("evm_increaseTime", [3600]);
    await network.provider.send("evm_mine");
    // 非 owner 账号尝试提款
    await expect(
      fundMe.connect(donor1).withdraw(AddressZero)
    ).to.be.revertedWith("Ownable: caller is not the owner");
  });

  it("防御退款函数的重入攻击", async function () {
    // 部署恶意合约
    const Attacker = await ethers.getContractFactory("ReentrantAttacker");
    attackerContract = await Attacker.connect(attackerUser).deploy(
      fundMe.address
    );
    await attackerContract.deployed();
    // 恶意合约作为捐款者参与并导致活动失败
    await attackerContract
      .connect(attackerUser)
      .donate({ value: ethers.parseEther("1") });
    // 让活动失败
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    await fundMe.finalize();
    expect(await fundMe.state()).to.equal(2);
    // 调用攻击合约发起 refund 攻击
    await expect(attackerContract.connect(attackerUser).refundAttack()).to.not
      .be.reverted;
    // 攻击合约应该成功收到退款 1 ETH（仅一次）
    const attackerBalance = await ethers.provider.getBalance(
      attackerContract.address
    );
    expect(attackerBalance).to.equal(ethers.parseEther("1"));
    // FundMe 中该攻击者的记录应归零
    expect(
      await fundMe.contributions(attackerContract.address, AddressZero)
    ).to.equal(0);
  });

  it("防御提款函数的重入攻击", async function () {
    // 准备募集成功的场景
    await fundMe
      .connect(donor1)
      .donate(AddressZero, 0, { value: ethers.parseEther("10") });
    await network.provider.send("evm_increaseTime", [604800]);
    await network.provider.send("evm_mine");
    await fundMe.finalize();
    expect(await fundMe.state()).to.equal(1);
    // 部署恶意合约并将 FundMe 拥有者转移给它
    const Attacker = await ethers.getContractFactory("ReentrantAttacker");
    attackerContract = await Attacker.connect(attackerUser).deploy(
      fundMe.address
    );
    await attackerContract.deployed();
    await fundMe.transferOwnership(attackerContract.address);
    // 恶意合约发起 withdraw 攻击
    const contractBalance = await ethers.provider.getBalance(fundMe.address);
    await expect(attackerContract.connect(attackerUser).withdrawAttack()).to.not
      .be.reverted;
    // 攻击合约应收到合约全部 ETH
    const attackerFinalBalance = await ethers.provider.getBalance(
      attackerContract.address
    );
    expect(attackerFinalBalance).to.equal(contractBalance);
  });
});
