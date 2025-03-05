// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";

contract FundMe is ReentrancyGuard, Ownable {
    enum State {
        Fundraising,
        Successful,
        Failed
    }
    State public state;
    uint public goal;
    uint public deadline;
    uint public lockPeriod;

    uint public totalEthRaised;
    mapping(address => uint) public totalTokenRaised;
    uint public totalRaisedCombined;

    // 记录每个用户每种币种的捐款数 (token地址为0表示ETH)
    mapping(address => mapping(address => uint)) public contributions;
    mapping(address => uint) public totalContributedCombined;
    mapping(address => uint) public donationCount;

    address[] public donorsList;
    mapping(address => bool) private donorExists;
    address[] public tokenList;
    mapping(address => bool) private tokenExists;

    struct DonorInfo {
        address donor;
        uint totalAmount;
    }
    DonorInfo[] public topDonors;

    event DonationReceived(
        address indexed donor,
        address indexed token,
        uint amount
    );
    event Withdrawn(address indexed owner, address indexed token, uint amount);
    event Refunded(address indexed donor, address indexed token, uint amount);
    event CampaignSuccessful(uint totalRaised);
    event CampaignFailed(uint totalRaised);

    constructor(uint _goal, uint _duration, uint _lockPeriod) {
        require(_duration > 0, "Duration must be > 0");
        goal = _goal;
        deadline = block.timestamp + _duration;
        lockPeriod = _lockPeriod;
        state = State.Fundraising;
        // Ownable父合约会将owner设置为部署者
    }

    receive() external payable nonReentrant {
        // 接收直接发送的ETH，视为一次ETH捐款
        require(
            state == State.Fundraising && block.timestamp < deadline,
            "Not fundraising"
        );
        require(msg.value > 0, "No ETH sent");
        _processDonation(msg.sender, address(0), msg.value);
    }

    function donate(address token, uint amount) external payable nonReentrant {
        require(
            state == State.Fundraising && block.timestamp < deadline,
            "Not fundraising"
        );
        if (token == address(0)) {
            // ETH 捐款
            require(msg.value > 0, "No ETH sent");
            require(amount == 0 || amount == msg.value, "Amount mismatch");
            _processDonation(msg.sender, address(0), msg.value);
        } else {
            // ERC20 代币捐款
            require(msg.value == 0, "ETH not accepted for token donation");
            require(amount > 0, "Token amount must be > 0");
            require(
                IERC20(token).transferFrom(msg.sender, address(this), amount),
                "Token transfer failed"
            );
            _processDonation(msg.sender, token, amount);
        }
    }

    function _processDonation(
        address donor,
        address token,
        uint amount
    ) internal {
        // 更新捐款记录
        contributions[donor][token] += amount;
        donationCount[donor] += 1;
        if (!donorExists[donor]) {
            donorExists[donor] = true;
            donorsList.push(donor);
        }
        if (token == address(0)) {
            totalEthRaised += amount;
        } else {
            totalTokenRaised[token] += amount;
            if (!tokenExists[token]) {
                tokenExists[token] = true;
                tokenList.push(token);
            }
        }
        // 统一换算捐款金额到18位精度，用于统计总额和排行榜比较
        uint scaledAmount = amount;
        uint8 decimals = 18;
        if (token != address(0)) {
            // 尝试获取代币精度
            try IERC20Metadata(token).decimals() returns (uint8 dec) {
                decimals = dec;
            } catch {
                decimals = 18;
            }
        }
        if (decimals < 18) {
            scaledAmount = amount * (10 ** (18 - decimals));
        } else if (decimals > 18) {
            scaledAmount = amount / (10 ** (decimals - 18));
        }
        totalContributedCombined[donor] += scaledAmount;
        totalRaisedCombined += scaledAmount;
        // 更新排行榜
        _updateLeaderboard(donor);
        emit DonationReceived(donor, token, amount);
    }

    function _updateLeaderboard(address donor) internal {
        uint donorTotal = totalContributedCombined[donor];
        bool found = false;
        uint idx;
        // 查找是否已在排行榜
        for (uint i = 0; i < topDonors.length; i++) {
            if (topDonors[i].donor == donor) {
                found = true;
                topDonors[i].totalAmount = donorTotal;
                idx = i;
                break;
            }
        }
        if (!found) {
            if (topDonors.length < 10) {
                topDonors.push(DonorInfo(donor, donorTotal));
                idx = topDonors.length - 1;
            } else {
                // 若排行榜已满，检查是否能进入前十
                uint minIndex = 0;
                uint minAmount = topDonors[0].totalAmount;
                for (uint j = 1; j < topDonors.length; j++) {
                    if (topDonors[j].totalAmount < minAmount) {
                        minAmount = topDonors[j].totalAmount;
                        minIndex = j;
                    }
                }
                if (donorTotal > minAmount) {
                    topDonors[minIndex].donor = donor;
                    topDonors[minIndex].totalAmount = donorTotal;
                    idx = minIndex;
                } else {
                    return; // 未进入排行榜
                }
            }
        }
        // 将当前更新的元素按总额大小插入适当位置（排序）
        while (
            idx > 0 &&
            topDonors[idx].totalAmount > topDonors[idx - 1].totalAmount
        ) {
            DonorInfo memory temp = topDonors[idx - 1];
            topDonors[idx - 1] = topDonors[idx];
            topDonors[idx] = temp;
            idx--;
        }
        // （由于捐款只增不减，这里无需向下调整）
    }

    function finalize() external {
        require(state == State.Fundraising, "Already finalized");
        require(block.timestamp >= deadline, "Campaign not ended");
        if (totalRaisedCombined >= goal) {
            state = State.Successful;
            emit CampaignSuccessful(totalRaisedCombined);
        } else {
            state = State.Failed;
            emit CampaignFailed(totalRaisedCombined);
        }
    }

    function withdraw(address token) external onlyOwner nonReentrant {
        require(state == State.Successful, "Campaign not successful");
        require(
            block.timestamp >= deadline + lockPeriod,
            "Withdrawal is time-locked"
        );
        if (token == address(0)) {
            uint balance = address(this).balance;
            require(balance > 0, "No ETH to withdraw");
            (bool success, ) = payable(msg.sender).call{value: balance}("");
            require(success, "ETH withdraw failed");
            emit Withdrawn(msg.sender, address(0), balance);
        } else {
            uint tokenBalance = IERC20(token).balanceOf(address(this));
            require(tokenBalance > 0, "No token balance");
            require(
                IERC20(token).transfer(msg.sender, tokenBalance),
                "Token withdraw failed"
            );
            emit Withdrawn(msg.sender, token, tokenBalance);
        }
    }

    function refund(address token) external nonReentrant {
        require(state == State.Failed, "Campaign not failed");
        uint contributed = contributions[msg.sender][token];
        require(contributed > 0, "Nothing to refund");
        // 将记录置0后再发送资金（Checks-Effects-Interactions）
        contributions[msg.sender][token] = 0;
        if (token == address(0)) {
            totalEthRaised -= contributed;
        } else {
            totalTokenRaised[token] -= contributed;
        }
        uint scaledAmount = contributed;
        uint8 decimals = 18;
        if (token != address(0)) {
            try IERC20Metadata(token).decimals() returns (uint8 dec) {
                decimals = dec;
            } catch {
                decimals = 18;
            }
        }
        if (decimals < 18) {
            scaledAmount = contributed * (10 ** (18 - decimals));
        } else if (decimals > 18) {
            scaledAmount = contributed / (10 ** (decimals - 18));
        }
        totalContributedCombined[msg.sender] -= scaledAmount;
        totalRaisedCombined -= scaledAmount;
        // 更新排行榜上该用户的金额
        for (uint i = 0; i < topDonors.length; i++) {
            if (topDonors[i].donor == msg.sender) {
                topDonors[i].totalAmount = totalContributedCombined[msg.sender];
            }
        }
        // 简单排序更新排行榜顺序
        uint n = topDonors.length;
        for (uint i = 0; i < n; i++) {
            for (uint j = 0; j < n - 1; j++) {
                if (topDonors[j].totalAmount < topDonors[j + 1].totalAmount) {
                    DonorInfo memory temp = topDonors[j];
                    topDonors[j] = topDonors[j + 1];
                    topDonors[j + 1] = temp;
                }
            }
        }
        // 退款转账
        if (token == address(0)) {
            (bool success, ) = payable(msg.sender).call{value: contributed}("");
            require(success, "ETH refund failed");
            emit Refunded(msg.sender, address(0), contributed);
        } else {
            require(
                IERC20(token).transfer(msg.sender, contributed),
                "Token refund failed"
            );
            emit Refunded(msg.sender, token, contributed);
        }
    }

    // 工具型只读函数，便于前端获取列表
    function getTopDonors() external view returns (DonorInfo[] memory) {
        return topDonors;
    }

    function getDonorsList() external view returns (address[] memory) {
        return donorsList;
    }

    function getTokenList() external view returns (address[] memory) {
        return tokenList;
    }
}
