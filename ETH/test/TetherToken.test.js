// Behavioral + security spec of TetherToken (USDT), run on the in-process Hardhat network.
const { expect } = require('chai');
const { ethers } = require('hardhat');
const { loadFixture } = require('@nomicfoundation/hardhat-toolbox/network-helpers');
const { USDT_SPEC } = require('../lib/common');

const usdt = (n) => ethers.parseUnits(String(n), 6);
const MAX_UINT = ethers.MaxUint256;

async function deployFixture() {
  const [owner, alice, bob, carol, attacker] = await ethers.getSigners();
  const token = await (await ethers.getContractFactory('TetherToken'))
    .deploy(USDT_SPEC.initialSupply, USDT_SPEC.name, USDT_SPEC.symbol, USDT_SPEC.decimals);
  await token.transfer(alice.address, usdt(1_000));
  return { token, owner, alice, bob, carol, attacker };
}

describe('TetherToken (USDT replica)', () => {
  describe('deployment', () => {
    it('has mainnet constructor state', async () => {
      const { token, owner } = await loadFixture(deployFixture);
      expect(await token.name()).to.equal('Tether USD');
      expect(await token.symbol()).to.equal('USDT');
      expect(await token.decimals()).to.equal(6n);
      expect(await token.totalSupply()).to.equal(USDT_SPEC.initialSupply);
      expect(await token._totalSupply()).to.equal(USDT_SPEC.initialSupply);
      expect(await token.balanceOf(owner.address)).to.equal(USDT_SPEC.initialSupply - usdt(1_000));
      expect(await token.owner()).to.equal(owner.address);
      expect(await token.getOwner()).to.equal(owner.address);
      expect(await token.paused()).to.equal(false);
      expect(await token.deprecated()).to.equal(false);
      expect(await token.upgradedAddress()).to.equal(ethers.ZeroAddress);
      expect(await token.basisPointsRate()).to.equal(0n);
      expect(await token.maximumFee()).to.equal(0n);
      expect(await token.MAX_UINT()).to.equal(MAX_UINT);
    });

    it('constructor emits no Transfer event for the initial supply', async () => {
      const token = await (await ethers.getContractFactory('TetherToken')).deploy(1n, 'Tether USD', 'USDT', 6);
      const receipt = await token.deploymentTransaction().wait();
      expect(receipt.logs).to.have.length(0);
    });
  });

  describe('issue / redeem (minting & burning)', () => {
    it('issue credits the OWNER balance and emits Issue (no Transfer event)', async () => {
      const { token, owner } = await loadFixture(deployFixture);
      const before = await token.balanceOf(owner.address);
      const tx = await token.issue(usdt(5_000));
      await expect(tx).to.emit(token, 'Issue').withArgs(usdt(5_000));
      await expect(tx).not.to.emit(token, 'Transfer');
      expect(await token.balanceOf(owner.address)).to.equal(before + usdt(5_000));
      expect(await token.totalSupply()).to.equal(USDT_SPEC.initialSupply + usdt(5_000));
    });

    it('SECURITY: only the owner can issue or redeem', async () => {
      const { token, attacker } = await loadFixture(deployFixture);
      await expect(token.connect(attacker).issue(usdt(1))).to.be.reverted;
      await expect(token.connect(attacker).redeem(usdt(1))).to.be.reverted;
    });

    it('issue(0) and overflowing issue revert (strict > checks)', async () => {
      const { token } = await loadFixture(deployFixture);
      await expect(token.issue(0)).to.be.reverted;
      await expect(token.issue(MAX_UINT)).to.be.reverted;
    });

    it('redeem burns from owner balance only, emits Redeem, and cannot exceed it', async () => {
      const { token, owner } = await loadFixture(deployFixture);
      const bal = await token.balanceOf(owner.address);
      await expect(token.redeem(usdt(10))).to.emit(token, 'Redeem').withArgs(usdt(10));
      expect(await token.balanceOf(owner.address)).to.equal(bal - usdt(10));
      expect(await token.totalSupply()).to.equal(USDT_SPEC.initialSupply - usdt(10));
      await expect(token.redeem(bal)).to.be.reverted;
    });
  });

  describe('non-standard ERC-20 surface', () => {
    it('transfer / transferFrom / approve return NO data (not ERC-20 compliant)', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      for (const [fn, args] of [['transfer', [bob.address, 1n]], ['approve', [bob.address, 1n]]]) {
        const data = token.interface.encodeFunctionData(fn, args);
        expect(await alice.call({ to: await token.getAddress(), data })).to.equal('0x');
      }
      expect(token.interface.getFunction('transfer').outputs).to.have.length(0);
      expect(token.interface.getFunction('transferFrom').outputs).to.have.length(0);
      expect(token.interface.getFunction('approve').outputs).to.have.length(0);
    });

    it('transfer moves balance and emits Transfer', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(token.connect(alice).transfer(bob.address, usdt(100)))
        .to.emit(token, 'Transfer').withArgs(alice.address, bob.address, usdt(100));
      expect(await token.balanceOf(bob.address)).to.equal(usdt(100));
      expect(await token.balanceOf(alice.address)).to.equal(usdt(900));
    });

    it('transfer above balance reverts (SafeMath assert)', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(token.connect(alice).transfer(bob.address, usdt(1_001))).to.be.reverted;
    });

    it('transfer to the zero address is allowed (tokens are effectively burned, supply unchanged)', async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await token.connect(alice).transfer(ethers.ZeroAddress, usdt(1));
      expect(await token.balanceOf(ethers.ZeroAddress)).to.equal(usdt(1));
      expect(await token.totalSupply()).to.equal(USDT_SPEC.initialSupply);
    });

    it('approve: changing a non-zero allowance to another non-zero value reverts (must reset to 0)', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await expect(token.connect(alice).approve(bob.address, usdt(10)))
        .to.emit(token, 'Approval').withArgs(alice.address, bob.address, usdt(10));
      await expect(token.connect(alice).approve(bob.address, usdt(20))).to.be.reverted;
      await token.connect(alice).approve(bob.address, 0);
      await token.connect(alice).approve(bob.address, usdt(20));
      expect(await token.allowance(alice.address, bob.address)).to.equal(usdt(20));
    });

    it('transferFrom spends allowance; exceeding it reverts', async () => {
      const { token, alice, bob, carol } = await loadFixture(deployFixture);
      await token.connect(alice).approve(bob.address, usdt(50));
      await token.connect(bob).transferFrom(alice.address, carol.address, usdt(30));
      expect(await token.allowance(alice.address, bob.address)).to.equal(usdt(20));
      expect(await token.balanceOf(carol.address)).to.equal(usdt(30));
      await expect(token.connect(bob).transferFrom(alice.address, carol.address, usdt(21))).to.be.reverted;
    });

    it('MAX_UINT allowance is infinite (never decremented)', async () => {
      const { token, alice, bob, carol } = await loadFixture(deployFixture);
      await token.connect(alice).approve(bob.address, MAX_UINT);
      await token.connect(bob).transferFrom(alice.address, carol.address, usdt(500));
      expect(await token.allowance(alice.address, bob.address)).to.equal(MAX_UINT);
    });

    it('SECURITY: short-address attack is blocked by onlyPayloadSize', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      const full = token.interface.encodeFunctionData('transfer', [bob.address, usdt(1)]);
      const truncated = full.slice(0, full.length - 2); // 4 + 32 + 31 bytes
      await expect(alice.sendTransaction({ to: await token.getAddress(), data: truncated })).to.be.reverted;
      const fullFrom = token.interface.encodeFunctionData('transferFrom', [alice.address, bob.address, 1n]);
      await expect(bob.sendTransaction({ to: await token.getAddress(), data: fullFrom.slice(0, -2) })).to.be.reverted;
    });

    it('SECURITY: nobody can spend another account without allowance', async () => {
      const { token, alice, attacker } = await loadFixture(deployFixture);
      await expect(token.connect(attacker).transferFrom(alice.address, attacker.address, 1n)).to.be.reverted;
    });
  });

  describe('pause', () => {
    it('blocks transfer and transferFrom; approve and issue still work', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await token.connect(alice).approve(bob.address, usdt(10));
      await expect(token.pause()).to.emit(token, 'Pause');
      await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.reverted;
      await expect(token.connect(bob).transferFrom(alice.address, bob.address, 1n)).to.be.reverted;
      await token.connect(alice).approve(bob.address, 0); // approve is NOT pausable
      await token.issue(usdt(1)); // issuance is NOT pausable
      await expect(token.unpause()).to.emit(token, 'Unpause');
      await token.connect(alice).transfer(bob.address, 1n);
    });

    it('SECURITY: only owner; cannot pause twice / unpause when running', async () => {
      const { token, attacker } = await loadFixture(deployFixture);
      await expect(token.connect(attacker).pause()).to.be.reverted;
      await expect(token.unpause()).to.be.reverted;
      await token.pause();
      await expect(token.pause()).to.be.reverted;
      await expect(token.connect(attacker).unpause()).to.be.reverted;
    });
  });

  describe('blacklist', () => {
    it('blacklisted account cannot send, nor be the _from of transferFrom', async () => {
      const { token, alice, bob } = await loadFixture(deployFixture);
      await token.connect(alice).approve(bob.address, usdt(10));
      await expect(token.addBlackList(alice.address)).to.emit(token, 'AddedBlackList').withArgs(alice.address);
      expect(await token.isBlackListed(alice.address)).to.equal(true);
      expect(await token.getBlackListStatus(alice.address)).to.equal(true);
      await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.reverted;
      await expect(token.connect(bob).transferFrom(alice.address, bob.address, 1n)).to.be.reverted;
      await expect(token.removeBlackList(alice.address)).to.emit(token, 'RemovedBlackList').withArgs(alice.address);
      await token.connect(alice).transfer(bob.address, 1n);
    });

    it('QUIRK: blacklisted account can still RECEIVE and APPROVE', async () => {
      const { token, owner, alice, bob } = await loadFixture(deployFixture);
      await token.addBlackList(alice.address);
      await token.connect(owner).transfer(alice.address, usdt(1));
      expect(await token.balanceOf(alice.address)).to.equal(usdt(1_001));
      await token.connect(alice).approve(bob.address, usdt(5));
      expect(await token.allowance(alice.address, bob.address)).to.equal(usdt(5));
    });

    it('QUIRK: a blacklisted SPENDER can still move funds it was approved for', async () => {
      const { token, alice, bob, carol } = await loadFixture(deployFixture);
      await token.connect(alice).approve(bob.address, usdt(10));
      await token.addBlackList(bob.address);
      await token.connect(bob).transferFrom(alice.address, carol.address, usdt(10)); // only _from is checked
      expect(await token.balanceOf(carol.address)).to.equal(usdt(10));
    });

    it('destroyBlackFunds zeroes the balance and burns supply (no Transfer event)', async () => {
      const { token, alice } = await loadFixture(deployFixture);
      await expect(token.destroyBlackFunds(alice.address)).to.be.reverted; // must be blacklisted first
      await token.addBlackList(alice.address);
      const tx = await token.destroyBlackFunds(alice.address);
      await expect(tx).to.emit(token, 'DestroyedBlackFunds').withArgs(alice.address, usdt(1_000));
      await expect(tx).not.to.emit(token, 'Transfer');
      expect(await token.balanceOf(alice.address)).to.equal(0n);
      expect(await token.totalSupply()).to.equal(USDT_SPEC.initialSupply - usdt(1_000));
    });

    it('SECURITY: only owner manages the blacklist', async () => {
      const { token, alice, attacker } = await loadFixture(deployFixture);
      await expect(token.connect(attacker).addBlackList(alice.address)).to.be.reverted;
      await token.addBlackList(alice.address);
      await expect(token.connect(attacker).removeBlackList(alice.address)).to.be.reverted;
      await expect(token.connect(attacker).destroyBlackFunds(alice.address)).to.be.reverted;
    });
  });

  describe('fees (setParams)', () => {
    it('fee = value * bps / 10000, capped at maximumFee, paid to owner with a second Transfer', async () => {
      const { token, owner, alice, bob } = await loadFixture(deployFixture);
      await expect(token.setParams(19, 49)).to.emit(token, 'Params').withArgs(19n, usdt(49));
      expect(await token.maximumFee()).to.equal(usdt(49)); // scaled by 10**decimals
      const ownerBefore = await token.balanceOf(owner.address);

      const fee = (usdt(100) * 19n) / 10_000n; // under the cap
      await expect(token.connect(alice).transfer(bob.address, usdt(100)))
        .to.emit(token, 'Transfer').withArgs(alice.address, owner.address, fee)
        .and.to.emit(token, 'Transfer').withArgs(alice.address, bob.address, usdt(100) - fee);
      expect(await token.balanceOf(owner.address)).to.equal(ownerBefore + fee);

      await token.issue(usdt(1_000_000));
      await token.transfer(alice.address, usdt(1_000_000));
      await token.connect(alice).approve(bob.address, MAX_UINT);
      await token.connect(bob).transferFrom(alice.address, bob.address, usdt(500_000)); // capped
      expect(await token.balanceOf(bob.address)).to.equal(usdt(100) - fee + usdt(500_000) - usdt(49));
    });

    it('SECURITY: hard-coded caps — bps < 20 and maxFee < 50 USDT; only owner', async () => {
      const { token, attacker } = await loadFixture(deployFixture);
      await expect(token.setParams(20, 0)).to.be.reverted;
      await expect(token.setParams(0, 50)).to.be.reverted;
      await expect(token.connect(attacker).setParams(1, 1)).to.be.reverted;
    });
  });

  describe('ownership', () => {
    it('transferOwnership(0x0) is a silent no-op; non-owner reverts', async () => {
      const { token, owner, attacker } = await loadFixture(deployFixture);
      await token.transferOwnership(ethers.ZeroAddress);
      expect(await token.owner()).to.equal(owner.address);
      await expect(token.connect(attacker).transferOwnership(attacker.address)).to.be.reverted;
    });

    it('new owner takes all powers; issue then credits the NEW owner (no event on handover)', async () => {
      const { token, owner, bob } = await loadFixture(deployFixture);
      const tx = await token.transferOwnership(bob.address);
      expect((await tx.wait()).logs).to.have.length(0);
      await expect(token.issue(1)).to.be.reverted;
      await token.connect(bob).issue(usdt(7));
      expect(await token.balanceOf(bob.address)).to.equal(usdt(7));
      expect(await token.balanceOf(owner.address)).to.equal(USDT_SPEC.initialSupply - usdt(1_000));
    });
  });

  describe('deprecate (upgrade path)', () => {
    async function deprecatedFixture() {
      const f = await deployFixture();
      const upgraded = await (await ethers.getContractFactory('UpgradedTokenMock')).deploy(await f.token.getAddress());
      await upgraded.credit(f.alice.address, usdt(42));
      await f.token.deprecate(await upgraded.getAddress());
      return { ...f, upgraded };
    }

    it('SECURITY: only owner can deprecate', async () => {
      const { token, attacker } = await loadFixture(deployFixture);
      await expect(token.connect(attacker).deprecate(attacker.address)).to.be.reverted;
    });

    it('forwards balanceOf / totalSupply / transfer / approve / transferFrom / allowance', async () => {
      const { token, upgraded, alice, bob, carol } = await loadFixture(deprecatedFixture);
      expect(await token.deprecated()).to.equal(true);
      expect(await token.upgradedAddress()).to.equal(await upgraded.getAddress());
      expect(await token.balanceOf(alice.address)).to.equal(usdt(42)); // legacy balance (1000) is hidden
      expect(await token.totalSupply()).to.equal(usdt(42));

      await token.connect(alice).transfer(bob.address, usdt(2));
      expect(await upgraded.balanceOf(bob.address)).to.equal(usdt(2));

      await token.connect(alice).approve(bob.address, usdt(5));
      expect(await token.allowance(alice.address, bob.address)).to.equal(usdt(5));
      await token.connect(bob).transferFrom(alice.address, carol.address, usdt(5));
      expect(await token.balanceOf(carol.address)).to.equal(usdt(5));
      expect(await token.balanceOf(alice.address)).to.equal(usdt(35));
    });

    it('legacy blacklist and pause are still enforced before forwarding', async () => {
      const { token, alice, bob } = await loadFixture(deprecatedFixture);
      await token.addBlackList(alice.address);
      await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.reverted;
      await token.removeBlackList(alice.address);
      await token.pause();
      await expect(token.connect(alice).transfer(bob.address, 1n)).to.be.reverted;
    });

    it('QUIRK: legacy issue/redeem keep touching the legacy ledger after deprecation', async () => {
      const { token, owner } = await loadFixture(deprecatedFixture);
      await expect(token.issue(usdt(1))).to.emit(token, 'Issue');
      expect(await token._totalSupply()).to.equal(USDT_SPEC.initialSupply + usdt(1));
      expect(await token.totalSupply()).to.equal(usdt(42)); // forwarded view ignores it
      expect(await token.balanceOf(owner.address)).to.equal(0n);
    });
  });
});
