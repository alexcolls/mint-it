pragma solidity ^0.4.17;

import "../TetherToken.sol";

// Test-only successor token used to exercise TetherToken.deprecate() forwarding.
// Mirrors how a real upgrade must authenticate the legacy contract as msg.sender.
contract UpgradedTokenMock is UpgradedStandardToken {
    address public legacy;

    function UpgradedTokenMock(address _legacy) public {
        legacy = _legacy;
    }

    modifier onlyLegacy() {
        require(msg.sender == legacy);
        _;
    }

    function totalSupply() public constant returns (uint) {
        return _totalSupply;
    }

    function credit(address who, uint value) public onlyOwner {
        balances[who] = balances[who].add(value);
        _totalSupply = _totalSupply.add(value);
    }

    function transferByLegacy(address from, address to, uint value) public onlyLegacy {
        balances[from] = balances[from].sub(value);
        balances[to] = balances[to].add(value);
        Transfer(from, to, value);
    }

    function transferFromByLegacy(address sender, address from, address to, uint value) public onlyLegacy {
        allowed[from][sender] = allowed[from][sender].sub(value);
        balances[from] = balances[from].sub(value);
        balances[to] = balances[to].add(value);
        Transfer(from, to, value);
    }

    function approveByLegacy(address from, address spender, uint value) public onlyLegacy {
        allowed[from][spender] = value;
        Approval(from, spender, value);
    }
}
