// pages/index.js
import { useState, useEffect } from "react";
import { ethers } from "ethers";
import addresses from "../constants/contract-address.json";
import FundMeArtifact from "../constants/FundMe.json";
import TokenArtifact from "../constants/TestToken.json";

export default function Home() {
  // 1. ----------------- React state -----------------
  const [provider, setProvider] = useState(null);
  const [signer, setSigner] = useState(null);
  const [currentAccount, setCurrentAccount] = useState(""); // 存储地址字符串

  const [fundMeContract, setFundMeContract] = useState(null);
  const [tokenContract, setTokenContract] = useState(null);

  // 是否为合约拥有者
  const [isOwner, setIsOwner] = useState(false);

  // 合约状态：fundState、deadline、lockPeriod 用 number，goal 等金额用 bigint
  const [fundState, setFundState] = useState(0);
  const [deadline, setDeadline] = useState(0);
  const [lockPeriod, setLockPeriod] = useState(0);

  const [goal, setGoal] = useState(0n); // bigint
  const [totalRaised, setTotalRaised] = useState(0n); // bigint
  const [totalEth, setTotalEth] = useState(0n); // bigint
  const [totalToken, setTotalToken] = useState(0n); // bigint

  // 用户捐款统计
  const [donationCount, setDonationCount] = useState(0);
  const [userEthContribution, setUserEthContribution] = useState(0n); // bigint
  const [userTokenContribution, setUserTokenContribution] = useState(0n); // bigint

  // 代币信息
  const [tokenSymbol, setTokenSymbol] = useState("TOKEN");
  const [tokenDecimals, setTokenDecimals] = useState(18);

  // 捐款输入
  const [donationAmount, setDonationAmount] = useState("");
  const [donationToken, setDonationToken] = useState("ETH"); // 'ETH' 或者 tokenSymbol

  // 排行榜
  const [topDonors, setTopDonors] = useState([]);

  // 2. ----------------- useEffect: 初始化合约 -----------------
  useEffect(() => {
    const init = async () => {
      if (!window.ethereum) {
        alert("请安装 MetaMask 来使用本应用");
        return;
      }

      // 2.1 创建 provider & signer
      const prov = new ethers.BrowserProvider(window.ethereum);
      await prov.send("eth_requestAccounts", []);
      const sign = await prov.getSigner();

      // 2.2 获取账户地址（字符串）
      const accounts = await prov.listAccounts();
      let userAddress = "";
      if (accounts.length > 0) {
        if (typeof accounts[0] === "string") {
          userAddress = accounts[0];
        } else {
          userAddress = accounts[0].address;
        }
      }

      // 2.3 设置 React state
      setProvider(prov);
      setSigner(sign);
      setCurrentAccount(userAddress);

      // 2.4 连接合约
      const fundMe = new ethers.Contract(
        addresses.FundMe,
        FundMeArtifact.abi,
        sign
      );
      setFundMeContract(fundMe);

      const token = new ethers.Contract(
        addresses.TestToken,
        TokenArtifact.abi,
        sign
      );
      setTokenContract(token);

      // 2.5 获取 token 符号和精度
      try {
        const sym = await token.symbol();
        setTokenSymbol(sym);
        const dec = await token.decimals();
        setTokenDecimals(dec);
      } catch (e) {
        console.error("Error fetching token metadata:", e);
      }

      // 2.6 读取合约主要信息
      const ownerAddr = await fundMe.owner();
      // fundState, deadline, lockPeriod 返回 bigint，需要转成 number
      const st = await fundMe.state();
      const dl = await fundMe.deadline();
      const lp = await fundMe.lockPeriod();

      // goal, totalEth, totalRaised, totalToken 返回 bigint
      const g = await fundMe.goal();
      const totalE = await fundMe.totalEthRaised();
      const totalComb = await fundMe.totalRaisedCombined();

      // 如果有 token 地址，则获取 totalTokenRaised
      let totalT = 0n;
      if (addresses.TestToken) {
        totalT = await fundMe.totalTokenRaised(addresses.TestToken);
      }

      // 设置 state
      setIsOwner(
        userAddress && ownerAddr
          ? userAddress.toLowerCase() === ownerAddr.toLowerCase()
          : false
      );
      setFundState(Number(st));
      setDeadline(Number(dl));
      setLockPeriod(Number(lp));

      setGoal(g);
      setTotalEth(totalE);
      setTotalRaised(totalComb);
      setTotalToken(totalT);

      // 2.7 如果当前地址非空，则加载个人捐款信息
      if (userAddress) {
        const dc = await fundMe.donationCount(userAddress);
        setDonationCount(Number(dc));

        const ethContrib = await fundMe.contributions(
          userAddress,
          ethers.ZeroAddress
        );
        setUserEthContribution(ethContrib);

        if (addresses.TestToken) {
          const tokenContrib = await fundMe.contributions(
            userAddress,
            addresses.TestToken
          );
          setUserTokenContribution(tokenContrib);
        }
      }

      // 2.8 加载排行榜
      const top = await fundMe.getTopDonors();
      const formattedTop = [];
      for (let i = 0; i < top.length; i++) {
        const donorAddress = top[i].donor || top[i][0];
        const totalAmt = top[i].totalAmount || top[i][1];
        if (donorAddress !== ethers.ZeroAddress) {
          // ethAmt / tokenAmt 同样是 bigint
          const ethAmt = await fundMe.contributions(
            donorAddress,
            ethers.ZeroAddress
          );
          let tokenAmt = 0n;
          if (addresses.TestToken) {
            tokenAmt = await fundMe.contributions(
              donorAddress,
              addresses.TestToken
            );
          }
          formattedTop.push({
            address: donorAddress,
            total: totalAmt, // bigint
            eth: ethAmt, // bigint
            token: tokenAmt, // bigint
          });
        }
      }
      setTopDonors(formattedTop);
    };

    init();
  }, []);

  // 3. ----------------- 刷新数据: 供捐款/退款/提款后调用 -----------------
  const refreshData = async () => {
    if (!fundMeContract || !currentAccount) return;

    const st = await fundMeContract.state();
    setFundState(Number(st));

    const totalComb = await fundMeContract.totalRaisedCombined();
    setTotalRaised(totalComb);

    const totalE = await fundMeContract.totalEthRaised();
    setTotalEth(totalE);

    let totalT = 0n;
    if (addresses.TestToken) {
      totalT = await fundMeContract.totalTokenRaised(addresses.TestToken);
    }
    setTotalToken(totalT);

    const dc = await fundMeContract.donationCount(currentAccount);
    setDonationCount(Number(dc));

    const ethContrib = await fundMeContract.contributions(
      currentAccount,
      ethers.ZeroAddress
    );
    setUserEthContribution(ethContrib);

    if (addresses.TestToken) {
      const tokenContrib = await fundMeContract.contributions(
        currentAccount,
        addresses.TestToken
      );
      setUserTokenContribution(tokenContrib);
    }

    const top = await fundMeContract.getTopDonors();
    const formattedTop = [];
    for (let i = 0; i < top.length; i++) {
      const donorAddress = top[i].donor || top[i][0];
      const totalAmt = top[i].totalAmount || top[i][1];
      if (donorAddress !== ethers.ZeroAddress) {
        const ethAmt = await fundMeContract.contributions(
          donorAddress,
          ethers.ZeroAddress
        );
        let tokenAmt = 0n;
        if (addresses.TestToken) {
          tokenAmt = await fundMeContract.contributions(
            donorAddress,
            addresses.TestToken
          );
        }
        formattedTop.push({
          address: donorAddress,
          total: totalAmt,
          eth: ethAmt,
          token: tokenAmt,
        });
      }
    }
    setTopDonors(formattedTop);
  };

  // 4. ----------------- 处理捐款/退款/提款 -----------------
  const handleDonate = async () => {
    if (!fundMeContract || !signer) return;
    if (!donationAmount || isNaN(donationAmount)) {
      alert("请输入有效的捐款金额");
      return;
    }
    try {
      if (donationToken === "ETH") {
        // ETH 捐款
        const ethValue = ethers.parseEther(donationAmount);
        const tx = await fundMeContract.donate(ethers.ZeroAddress, 0, {
          value: ethValue,
        });
        await tx.wait();
      } else {
        // 代币捐款
        const tokenAddr = addresses.TestToken;
        const amountWei = ethers.parseUnits(donationAmount, tokenDecimals);

        // 先 approve 后 donate
        const approveTx = await tokenContract.approve(
          addresses.FundMe,
          amountWei
        );
        await approveTx.wait();

        const tx = await fundMeContract.donate(tokenAddr, amountWei);
        await tx.wait();
      }
      alert("捐款成功！");
      setDonationAmount("");
      await refreshData();
    } catch (err) {
      console.error(err);
      alert("捐款失败: " + err.message);
    }
  };

  const handleRefund = async (currency) => {
    if (!fundMeContract) return;
    try {
      const tx =
        currency === "ETH"
          ? await fundMeContract.refund(ethers.ZeroAddress)
          : await fundMeContract.refund(addresses.TestToken);
      await tx.wait();
      alert(`已退款 ${currency} 捐款`);
      await refreshData();
    } catch (err) {
      console.error(err);
      alert("退款失败: " + err.message);
    }
  };

  const handleWithdraw = async (currency) => {
    if (!fundMeContract) return;
    try {
      const tx =
        currency === "ETH"
          ? await fundMeContract.withdraw(ethers.ZeroAddress)
          : await fundMeContract.withdraw(addresses.TestToken);
      await tx.wait();
      alert(`已提取 ${currency}`);
      await refreshData();
    } catch (err) {
      console.error(err);
      alert("提款失败: " + err.message);
    }
  };

  // 5. ----------------- 计算进度条/时间文本等 -----------------
  // goal, totalRaised 都是 bigint，可以用普通大整数运算
  const progressPercent = goal > 0n ? Number((totalRaised * 100n) / goal) : 0;

  const deadlineDate = deadline
    ? new Date(deadline * 1000).toLocaleString()
    : "";
  const withdrawUnlockTime =
    deadline && lockPeriod
      ? new Date((deadline + lockPeriod) * 1000).toLocaleString()
      : "";

  // 6. ----------------- 渲染 -----------------
  return (
    <div style={{ padding: "20px" }}>
      <h1>FundMe 众筹平台</h1>

      {currentAccount ? (
        <p>
          当前账户: {currentAccount} {isOwner && "(创建者)"}
        </p>
      ) : (
        <button
          onClick={async () => {
            if (!provider) return;
            await provider.send("eth_requestAccounts", []);
            const accs = await provider.listAccounts();
            let userAddress = "";
            if (accs.length > 0) {
              if (typeof accs[0] === "string") {
                userAddress = accs[0];
              } else {
                userAddress = accs[0].address;
              }
            }
            setCurrentAccount(userAddress);
          }}
        >
          连接钱包
        </button>
      )}

      {goal > 0n && (
        <div>
          <h3>项目进度</h3>
          <p>目标金额: {ethers.formatEther(goal)} ETH</p>
          <p>
            已募集: {ethers.formatEther(totalRaised)} 单位 (
            {ethers.formatEther(totalEth)} ETH
            {totalToken > 0n &&
              ` + ${ethers.formatUnits(
                totalToken,
                tokenDecimals
              )} ${tokenSymbol}`}
            )
          </p>
          <div
            style={{
              background: "#eee",
              width: "100%",
              height: "20px",
              borderRadius: "5px",
              overflow: "hidden",
            }}
          >
            <div
              style={{
                background: "green",
                width: `${Math.min(progressPercent, 100)}%`,
                height: "100%",
              }}
            />
          </div>
          <p>
            当前状态:{" "}
            {fundState === 0 ? "募资中" : fundState === 1 ? "成功" : "失败"}
          </p>
          <p>截止时间: {deadlineDate}</p>
          {fundState === 1 && <p>提款解锁时间: {withdrawUnlockTime}</p>}
        </div>
      )}

      <div>
        <h3>我要捐款</h3>
        {fundState === 0 ? (
          <div>
            <input
              type="text"
              placeholder="金额"
              value={donationAmount}
              onChange={(e) => setDonationAmount(e.target.value)}
            />
            <select
              value={donationToken}
              onChange={(e) => setDonationToken(e.target.value)}
            >
              <option value="ETH">ETH</option>
              <option value={tokenSymbol}>{tokenSymbol}</option>
            </select>
            <button onClick={handleDonate}>捐款</button>
          </div>
        ) : (
          <p>捐款已关闭。</p>
        )}
      </div>

      <div>
        <h3>捐款排行榜</h3>
        <table border="1" cellPadding="5">
          <thead>
            <tr>
              <th>捐款者</th>
              <th>总捐款 (单位)</th>
              <th>明细 (ETH / {tokenSymbol})</th>
            </tr>
          </thead>
          <tbody>
            {topDonors.map((d, idx) => (
              <tr key={idx}>
                <td>{d.address}</td>
                <td>{ethers.formatEther(d.total)}</td>
                <td>
                  {ethers.formatEther(d.eth)} ETH
                  {d.token > 0n &&
                    `, ${ethers.formatUnits(
                      d.token,
                      tokenDecimals
                    )} ${tokenSymbol}`}
                </td>
              </tr>
            ))}
            {topDonors.length === 0 && (
              <tr>
                <td colSpan="3">尚无捐款。</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div>
        <h3>我的捐款</h3>
        <p>捐款次数: {donationCount}</p>
        <p>
          累计捐款: {ethers.formatEther(userEthContribution)} ETH
          {addresses.TestToken &&
            userTokenContribution > 0n &&
            ` + ${ethers.formatUnits(
              userTokenContribution,
              tokenDecimals
            )} ${tokenSymbol}`}
        </p>
        {fundState === 2 && (
          <div>
            {userEthContribution > 0n && (
              <button onClick={() => handleRefund("ETH")}>
                退款 {ethers.formatEther(userEthContribution)} ETH
              </button>
            )}
            {userTokenContribution > 0n && (
              <button onClick={() => handleRefund(tokenSymbol)}>
                退款 {ethers.formatUnits(userTokenContribution, tokenDecimals)}{" "}
                {tokenSymbol}
              </button>
            )}
          </div>
        )}
      </div>

      {isOwner && (
        <div>
          <h3>创建者操作</h3>
          {fundState === 1 ? (
            <div>
              {Date.now() / 1000 < deadline + lockPeriod ? (
                <p>提款将在 {withdrawUnlockTime} 之后解锁</p>
              ) : (
                <div>
                  <button onClick={() => handleWithdraw("ETH")}>
                    提取全部 ETH
                  </button>
                  {totalToken > 0n && (
                    <button onClick={() => handleWithdraw(tokenSymbol)}>
                      提取全部 {tokenSymbol}
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : fundState === 0 ? (
            <p>筹款尚未结束，暂不可提款。</p>
          ) : (
            <p>筹款失败，无法提款（出资人可自行退款）。</p>
          )}
        </div>
      )}
    </div>
  );
}
