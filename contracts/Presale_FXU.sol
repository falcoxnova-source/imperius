// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

interface IERC20 {
    function totalSupply() external view returns (uint256);
    function balanceOf(address account) external view returns (uint256);
    function allowance(address owner, address spender) external view returns (uint256);
    function transfer(address to, uint256 value) external returns (bool);
    function approve(address spender, uint256 value) external returns (bool);
    function transferFrom(address from, address to, uint256 value) external returns (bool);
}

interface IERC20Metadata is IERC20 {
    function decimals() external view returns (uint8);
}

library SafeERC20 {
    function safeTransfer(IERC20 token, address to, uint256 value) internal {
        require(token.balanceOf(address(this)) >= value, "SafeERC20: insufficient balance");
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(token.transfer.selector, to, value));
        require(success, "SafeERC20: transfer failed");
        if (data.length > 0) {
            require(abi.decode(data, (bool)), "SafeERC20: transfer returned false");
        }
    }

    function safeTransferFrom(IERC20 token, address from, address to, uint256 value) internal {
        require(token.balanceOf(from) >= value, "SafeERC20: insufficient sender balance");
        require(token.allowance(from, address(this)) >= value, "SafeERC20: insufficient allowance");
        (bool success, bytes memory data) = address(token).call(abi.encodeWithSelector(token.transferFrom.selector, from, to, value));
        require(success, "SafeERC20: transferFrom failed");
        if (data.length > 0) {
            require(abi.decode(data, (bool)), "SafeERC20: transferFrom returned false");
        }
    }
}

abstract contract ReentrancyGuard {
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;
    uint256 private _status;

    constructor() {
        _status = _NOT_ENTERED;
    }

    modifier nonReentrant() {
        require(_status != _ENTERED, "ReentrancyGuard: reentrant call");
        _status = _ENTERED;
        _;
        _status = _NOT_ENTERED;
    }
}

abstract contract Ownable2Step {
    address private _owner;
    address private _pendingOwner;

    event OwnershipTransferStarted(address indexed previousOwner, address indexed newOwner);
    event OwnershipTransferred(address indexed previousOwner, address indexed newOwner);

    constructor() {
        _owner = msg.sender;
        emit OwnershipTransferred(address(0), msg.sender);
    }

    modifier onlyOwner() {
        require(msg.sender == _owner, "Ownable: caller is not the owner");
        _;
    }

    function owner() public view virtual returns (address) {
        return _owner;
    }

    function pendingOwner() public view virtual returns (address) {
        return _pendingOwner;
    }

    function transferOwnership(address newOwner) public virtual onlyOwner {
        require(newOwner != address(0), "Ownable: new owner is zero address");
        _pendingOwner = newOwner;
        emit OwnershipTransferStarted(_owner, newOwner);
    }

    function acceptOwnership() public virtual {
        require(msg.sender == _pendingOwner, "Ownable: caller is not pending owner");
        address oldOwner = _owner;
        _owner = _pendingOwner;
        _pendingOwner = address(0);
        emit OwnershipTransferred(oldOwner, _owner);
    }
}

abstract contract Pausable is Ownable2Step {
    bool private _paused;

    event Paused(address account);
    event Unpaused(address account);

    constructor() {
        _paused = false;
    }

    modifier whenNotPaused() {
        require(!_paused, "Pausable: paused");
        _;
    }

    modifier whenPaused() {
        require(_paused, "Pausable: not paused");
        _;
    }

    function paused() public view virtual returns (bool) {
        return _paused;
    }

    function pause() public virtual onlyOwner whenNotPaused {
        _paused = true;
        emit Paused(msg.sender);
    }

    function unpause() public virtual onlyOwner whenPaused {
        _paused = false;
        emit Unpaused(msg.sender);
    }
}

contract FXU_Presale is Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public saleToken;
    IERC20 public paymentToken;
    uint8 public saleTokenDecimals;
    uint8 public paymentDecimals;
    address public fundsWallet;

    struct Tier {
        uint256 minSpend;
        uint256 pricePerToken;
    }
    Tier[] public tiers;

    uint64 public constant SALE_START = 1768914000;
    uint64 public constant SALE_END = 1769950800;
    uint64 public constant RELEASE_TIME = SALE_END;
    uint256 public constant TGE_PERCENTAGE = 1000;
    uint256 public constant VESTING_CYCLES = 9;
    uint256 public constant CYCLE_DURATION = 30 days;

    mapping(address => uint256) public vestedBalance;
    mapping(address => uint256) public referralVestedBalance;
    mapping(address => uint256) public claimedAmount;
    mapping(address => uint256) public claimedReferralAmount;
    uint256 public totalVestedCommitment;

    uint256 public minPurchase;
    uint256 public maxPurchase;
    uint256 public hardCapPayment;
    uint256 public totalRaised;

    bool public referralEnabled = true;
    uint256 public referralBonusBps = 500;

    struct ReferralCommit {
        address referrer;
        uint64 timestamp;
        bool used;
    }
    mapping(bytes32 => ReferralCommit) public pendingReferrals;
    mapping(address => address) public referrerOf;
    mapping(address => uint256) public referralEarnings;
    mapping(address => uint256) public referredCount;
    mapping(address => bool) public hasUsedReferral;

    uint256 public constant COMMIT_EXPIRY_TIME = 1 hours;

    event ConfigTokens(address indexed saleToken, uint8 saleDecimals, address indexed paymentToken, uint8 paymentDecimals);
    event FundsWalletUpdated(address indexed newWallet);
    event TiersUpdated(uint256 count);
    event Purchase(address indexed buyer, address indexed recipient, uint256 spent, uint256 tokensOut, uint256 price);
    event Claim(address indexed account, uint256 amount);
    event Rescue(address indexed token, address indexed to, uint256 amount);
    event WithdrawPayment(address indexed to, uint256 amount);
    event WithdrawUnsold(address indexed to, uint256 amount);
    event LimitsUpdated(uint256 minPurchase, uint256 maxPurchase, uint256 hardCap);
    event ReferralRegistered(address indexed referrer, address indexed referred);
    event ReferralBonusPaid(address indexed referrer, address indexed referred, uint256 bonus, uint256 purchase);
    event ReferralConfigUpdated(bool enabled, uint256 bonusBps);
    event ReferralClaim(address indexed referrer, uint256 amount);
    event ReferrerRemoved(address indexed user, address indexed formerReferrer);
    event ReferralCommitCreated(address indexed referrer, address indexed referred, bytes32 commitHash);
    event ReferralCommitExecuted(bytes32 commitHash);

    error InvalidArray();
    error UnsortedTiers();
    error NoTiers();
    error ZeroAddress();
    error InvalidTime();
    error OutOfWindow();
    error AmountTooLow();
    error AmountTooHigh();
    error HardCapExceeded();
    error PriceZero();
    error NothingToClaim();
    error SelfReferral();
    error AlreadyReferred();
    error InvalidCommit();
    error CommitExpired();
    error CommitAlreadyUsed();
    error DifferentReferrerExists();
    error InsufficientTokenBalance();

    modifier whenReferralEnabled() {
        require(referralEnabled, "Referral disabled");
        _;
    }

    constructor(
        address _saleToken,
        address _paymentToken,
        address _fundsWallet,
        uint256[] memory _minSpends,
        uint256[] memory _pricesPerToken
    ) {
        if (_saleToken == address(0) || _paymentToken == address(0) || _fundsWallet == address(0)) revert ZeroAddress();

        saleToken = IERC20(_saleToken);
        paymentToken = IERC20(_paymentToken);
        fundsWallet = _fundsWallet;

        saleTokenDecimals = _tryGetDecimals(_saleToken, 18);
        paymentDecimals = _tryGetDecimals(_paymentToken, 18);

        emit ConfigTokens(_saleToken, saleTokenDecimals, _paymentToken, paymentDecimals);

        _setTiers(_minSpends, _pricesPerToken);
    }

    function buy(uint256 amountInPaymentToken, address recipient) external nonReentrant whenNotPaused {
        _processPurchase(amountInPaymentToken, recipient, address(0));
    }

    function buyWithReferral(uint256 amountInPaymentToken, address recipient, address referrer) external nonReentrant whenNotPaused whenReferralEnabled {
        if (referrer == address(0)) revert ZeroAddress();
        if (referrer == msg.sender) revert SelfReferral();
        if (recipient == address(0)) recipient = msg.sender;
        if (referrer == recipient) revert SelfReferral();

        _processPurchase(amountInPaymentToken, recipient, referrer);
    }

    function createReferralCommit(address referred) external whenReferralEnabled returns (bytes32) {
        if (referred == address(0)) revert ZeroAddress();
        if (referred == msg.sender) revert SelfReferral();
        if (hasUsedReferral[referred]) revert AlreadyReferred();

        bytes32 commitHash = keccak256(abi.encodePacked(msg.sender, referred, block.timestamp, blockhash(block.number - 1)));

        pendingReferrals[commitHash] = ReferralCommit({
            referrer: msg.sender,
            timestamp: uint64(block.timestamp),
            used: false
        });

        emit ReferralCommitCreated(msg.sender, referred, commitHash);
        return commitHash;
    }

    function buyWithReferralCommit(uint256 amountInPaymentToken, address recipient, bytes32 commitHash) external nonReentrant whenNotPaused whenReferralEnabled {
        if (recipient == address(0)) recipient = msg.sender;

        ReferralCommit memory commit = pendingReferrals[commitHash];
        if (commit.referrer == address(0)) revert InvalidCommit();
        if (commit.used) revert CommitAlreadyUsed();
        if (commit.timestamp + COMMIT_EXPIRY_TIME < block.timestamp) revert CommitExpired();
        if (commit.referrer == recipient) revert SelfReferral();

        if (hasUsedReferral[recipient] && referrerOf[recipient] != commit.referrer) {
            revert DifferentReferrerExists();
        }

        pendingReferrals[commitHash].used = true;
        _processPurchase(amountInPaymentToken, recipient, commit.referrer);
        emit ReferralCommitExecuted(commitHash);
    }

    function _processPurchase(uint256 amountInPaymentToken, address recipient, address referrer) internal {
        if (recipient == address(0)) recipient = msg.sender;

        address finalReferrer = address(0);

        if (referrer != address(0)) {
            if (hasUsedReferral[recipient]) {
                if (referrerOf[recipient] != referrer) revert DifferentReferrerExists();
                finalReferrer = referrerOf[recipient];
            } else {
                if (referrerOf[recipient] != address(0)) revert AlreadyReferred();
                referrerOf[recipient] = referrer;
                referredCount[referrer]++;
                hasUsedReferral[recipient] = true;
                finalReferrer = referrer;
                emit ReferralRegistered(referrer, recipient);
            }
        }

        if (block.timestamp < SALE_START) revert OutOfWindow();
        if (block.timestamp > SALE_END) revert OutOfWindow();

        if (amountInPaymentToken == 0) revert AmountTooLow();
        if (minPurchase != 0 && amountInPaymentToken < minPurchase) revert AmountTooLow();
        if (maxPurchase != 0 && amountInPaymentToken > maxPurchase) revert AmountTooHigh();
        if (hardCapPayment != 0 && totalRaised + amountInPaymentToken > hardCapPayment) revert HardCapExceeded();

        (uint256 appliedPrice,,) = quotePrice(amountInPaymentToken);
        if (appliedPrice == 0) revert PriceZero();

        uint256 tokensOut = _calcTokensOut(amountInPaymentToken, appliedPrice);
        uint256 totalTokensNeeded = tokensOut;

        uint256 referralBonus = 0;
        if (finalReferrer != address(0) && referralEnabled) {
            referralBonus = (tokensOut * referralBonusBps) / 10000;
            if (referralBonus > 0) {
                totalTokensNeeded += referralBonus;
            }
        }

        uint256 contractBalance = saleToken.balanceOf(address(this));
        uint256 totalCommitmentAfter = totalVestedCommitment + totalTokensNeeded;
        if (contractBalance < totalCommitmentAfter) revert InsufficientTokenBalance();

        paymentToken.safeTransferFrom(msg.sender, fundsWallet, amountInPaymentToken);
        totalRaised += amountInPaymentToken;

        vestedBalance[recipient] += tokensOut;
        totalVestedCommitment += tokensOut;

        if (referralBonus > 0) {
            referralVestedBalance[finalReferrer] += referralBonus;
            totalVestedCommitment += referralBonus;
            referralEarnings[finalReferrer] += referralBonus;
            emit ReferralBonusPaid(finalReferrer, recipient, referralBonus, tokensOut);
        }

        emit Purchase(msg.sender, recipient, amountInPaymentToken, tokensOut, appliedPrice);
    }

    function calculateAvailableAmount(address user) public view returns (uint256) {
        if (block.timestamp < RELEASE_TIME) return 0;

        uint256 totalVested = vestedBalance[user];
        if (totalVested == 0) return 0;

        uint256 tgeAmount = (totalVested * TGE_PERCENTAGE) / 10000;
        uint256 timeElapsed = block.timestamp - RELEASE_TIME;
        uint256 cyclesPassed = timeElapsed / CYCLE_DURATION;

        if (cyclesPassed > VESTING_CYCLES) cyclesPassed = VESTING_CYCLES;

        uint256 remainingAfterTGE = totalVested - tgeAmount;
        uint256 cycleAmount = (remainingAfterTGE * cyclesPassed) / VESTING_CYCLES;

        return tgeAmount + cycleAmount;
    }

    function calculateAvailableReferralAmount(address user) public view returns (uint256) {
        if (block.timestamp < RELEASE_TIME) return 0;

        uint256 totalVested = referralVestedBalance[user];
        if (totalVested == 0) return 0;

        uint256 tgeAmount = (totalVested * TGE_PERCENTAGE) / 10000;
        uint256 timeElapsed = block.timestamp - RELEASE_TIME;
        uint256 cyclesPassed = timeElapsed / CYCLE_DURATION;

        if (cyclesPassed > VESTING_CYCLES) cyclesPassed = VESTING_CYCLES;

        uint256 remainingAfterTGE = totalVested - tgeAmount;
        uint256 cycleAmount = (remainingAfterTGE * cyclesPassed) / VESTING_CYCLES;

        return tgeAmount + cycleAmount;
    }

    function claim() external nonReentrant {
        if (block.timestamp < RELEASE_TIME) revert InvalidTime();

        uint256 available = calculateAvailableAmount(msg.sender);
        uint256 alreadyClaimed = claimedAmount[msg.sender];

        if (available <= alreadyClaimed) revert NothingToClaim();

        uint256 toTransfer = available - alreadyClaimed;
        claimedAmount[msg.sender] = available;
        totalVestedCommitment -= toTransfer;

        saleToken.safeTransfer(msg.sender, toTransfer);
        emit Claim(msg.sender, toTransfer);
    }

    function claimReferralBonus() external nonReentrant {
        if (block.timestamp < RELEASE_TIME) revert InvalidTime();

        uint256 available = calculateAvailableReferralAmount(msg.sender);
        uint256 alreadyClaimed = claimedReferralAmount[msg.sender];

        if (available <= alreadyClaimed) revert NothingToClaim();

        uint256 toTransfer = available - alreadyClaimed;
        claimedReferralAmount[msg.sender] = available;
        totalVestedCommitment -= toTransfer;

        saleToken.safeTransfer(msg.sender, toTransfer);
        emit ReferralClaim(msg.sender, toTransfer);
    }

    function claimAll() external nonReentrant {
        if (block.timestamp < RELEASE_TIME) revert InvalidTime();

        uint256 availablePurchase = calculateAvailableAmount(msg.sender);
        uint256 availableReferral = calculateAvailableReferralAmount(msg.sender);

        uint256 alreadyClaimedPurchase = claimedAmount[msg.sender];
        uint256 alreadyClaimedReferral = claimedReferralAmount[msg.sender];

        uint256 toTransferPurchase = 0;
        uint256 toTransferReferral = 0;

        if (availablePurchase > alreadyClaimedPurchase) {
            toTransferPurchase = availablePurchase - alreadyClaimedPurchase;
            claimedAmount[msg.sender] = availablePurchase;
        }

        if (availableReferral > alreadyClaimedReferral) {
            toTransferReferral = availableReferral - alreadyClaimedReferral;
            claimedReferralAmount[msg.sender] = availableReferral;
        }

        uint256 totalToTransfer = toTransferPurchase + toTransferReferral;
        if (totalToTransfer == 0) revert NothingToClaim();

        totalVestedCommitment -= totalToTransfer;
        saleToken.safeTransfer(msg.sender, totalToTransfer);

        if (toTransferPurchase > 0) emit Claim(msg.sender, toTransferPurchase);
        if (toTransferReferral > 0) emit ReferralClaim(msg.sender, toTransferReferral);
    }

    function preview(uint256 amountInPaymentToken) external view returns (uint256 appliedPrice, uint256 tierIndex, uint256 tokensOut) {
        (appliedPrice, tierIndex,) = quotePrice(amountInPaymentToken);
        if (appliedPrice == 0) return (0, tierIndex, 0);
        tokensOut = _calcTokensOut(amountInPaymentToken, appliedPrice);
    }

    function quotePrice(uint256 amountInPaymentToken) public view returns (uint256 appliedPrice, uint256 tierIndex, bool found) {
        uint256 n = tiers.length;
        if (n == 0) return (0, 0, false);

        for (uint256 i = 0; i < n; i++) {
            if (amountInPaymentToken >= tiers[i].minSpend) {
                appliedPrice = tiers[i].pricePerToken;
                tierIndex = i;
                found = true;
            } else {
                break;
            }
        }
    }

    function tiersCount() external view returns (uint256) {
        return tiers.length;
    }

    function getVestingInfo(address user) external view returns (uint256 totalVested, uint256 totalClaimed, uint256 available, uint256 remaining) {
        totalVested = vestedBalance[user];
        totalClaimed = claimedAmount[user];
        uint256 availableCalc = calculateAvailableAmount(user);
        available = availableCalc > totalClaimed ? availableCalc - totalClaimed : 0;
        remaining = totalVested > totalClaimed + available ? totalVested - totalClaimed - available : 0;
    }

    function getReferralVestingInfo(address user) external view returns (uint256 totalVested, uint256 totalClaimed, uint256 available, uint256 remaining) {
        totalVested = referralVestedBalance[user];
        totalClaimed = claimedReferralAmount[user];
        uint256 availableCalc = calculateAvailableReferralAmount(user);
        available = availableCalc > totalClaimed ? availableCalc - totalClaimed : 0;
        remaining = totalVested > totalClaimed + available ? totalVested - totalClaimed - available : 0;
    }

    function getClaimableAmounts(address user) external view returns (uint256 purchasedTokens, uint256 referralTokens, uint256 totalTokens) {
        uint256 availablePurchase = calculateAvailableAmount(user);
        uint256 availableReferral = calculateAvailableReferralAmount(user);
        purchasedTokens = availablePurchase > claimedAmount[user] ? availablePurchase - claimedAmount[user] : 0;
        referralTokens = availableReferral > claimedReferralAmount[user] ? availableReferral - claimedReferralAmount[user] : 0;
        totalTokens = purchasedTokens + referralTokens;
    }

    function getTotalClaimable(address user) external view returns (uint256) {
        uint256 availablePurchase = calculateAvailableAmount(user);
        uint256 availableReferral = calculateAvailableReferralAmount(user);
        uint256 unclaimedPurchase = availablePurchase > claimedAmount[user] ? availablePurchase - claimedAmount[user] : 0;
        uint256 unclaimedReferral = availableReferral > claimedReferralAmount[user] ? availableReferral - claimedReferralAmount[user] : 0;
        return unclaimedPurchase + unclaimedReferral;
    }

    function getSaleInfo() external view returns (
        uint64 saleStart,
        uint64 saleEnd,
        uint64 releaseTime,
        uint256 tgePercentage,
        uint256 vestingCycles,
        uint256 cycleDuration,
        uint256 raised,
        bool isActive
    ) {
        return (SALE_START, SALE_END, RELEASE_TIME, TGE_PERCENTAGE, VESTING_CYCLES, CYCLE_DURATION, totalRaised, block.timestamp >= SALE_START && block.timestamp <= SALE_END);
    }

    function getVestingSchedule() external pure returns (uint256 tgePercent, uint256 cycles, uint256 cycleDays, uint256 totalMonths) {
        return (TGE_PERCENTAGE / 100, VESTING_CYCLES, CYCLE_DURATION / 1 days, VESTING_CYCLES + 1);
    }

    function getReferrer(address user) external view returns (address) {
        return referrerOf[user];
    }

    function getReferralEarnings(address referrer) external view returns (uint256) {
        return referralEarnings[referrer];
    }

    function getReferredCount(address referrer) external view returns (uint256) {
        return referredCount[referrer];
    }

    function hasUserUsedReferral(address user) external view returns (bool) {
        return hasUsedReferral[user];
    }

    function calculateReferralBonus(uint256 purchaseAmount) external view returns (uint256) {
        (uint256 appliedPrice,,) = quotePrice(purchaseAmount);
        if (appliedPrice == 0) return 0;
        uint256 tokensOut = _calcTokensOut(purchaseAmount, appliedPrice);
        return (tokensOut * referralBonusBps) / 10000;
    }

    function getReferralInfo(address user) external view returns (address referrer, uint256 earnings, uint256 count, bool usedReferral, uint256 pendingBonus) {
        referrer = referrerOf[user];
        earnings = referralEarnings[user];
        count = referredCount[user];
        usedReferral = hasUsedReferral[user];
        uint256 available = calculateAvailableReferralAmount(user);
        pendingBonus = available > claimedReferralAmount[user] ? available - claimedReferralAmount[user] : 0;
    }

    function checkPendingCommit(bytes32 commitHash) external view returns (address) {
        return pendingReferrals[commitHash].referrer;
    }

    function getPendingCommitInfo(bytes32 commitHash) external view returns (address referrer, uint64 timestamp, bool used, bool expired) {
        ReferralCommit memory commit = pendingReferrals[commitHash];
        return (commit.referrer, commit.timestamp, commit.used, commit.timestamp > 0 && commit.timestamp + COMMIT_EXPIRY_TIME < block.timestamp);
    }

    function setTokens(address _saleToken, address _paymentToken) external onlyOwner {
        if (_saleToken == address(0) || _paymentToken == address(0)) revert ZeroAddress();
        saleToken = IERC20(_saleToken);
        paymentToken = IERC20(_paymentToken);
        saleTokenDecimals = _tryGetDecimals(_saleToken, 18);
        paymentDecimals = _tryGetDecimals(_paymentToken, 18);
        emit ConfigTokens(_saleToken, saleTokenDecimals, _paymentToken, paymentDecimals);
    }

    function overrideDecimals(uint8 _saleDecimals, uint8 _paymentDecimals) external onlyOwner {
        require(_saleDecimals > 0 && _saleDecimals <= 36, "Invalid sale decimals");
        require(_paymentDecimals > 0 && _paymentDecimals <= 36, "Invalid payment decimals");
        saleTokenDecimals = _saleDecimals;
        paymentDecimals = _paymentDecimals;
        emit ConfigTokens(address(saleToken), saleTokenDecimals, address(paymentToken), paymentDecimals);
    }

    function setFundsWallet(address _fundsWallet) external onlyOwner {
        if (_fundsWallet == address(0)) revert ZeroAddress();
        fundsWallet = _fundsWallet;
        emit FundsWalletUpdated(_fundsWallet);
    }

    function setTiers(uint256[] calldata _minSpends, uint256[] calldata _pricesPerToken) external onlyOwner {
        _setTiers(_minSpends, _pricesPerToken);
    }

    function _setTiers(uint256[] memory _minSpends, uint256[] memory _pricesPerToken) internal {
        if (_minSpends.length == 0 || _minSpends.length != _pricesPerToken.length) revert InvalidArray();
        if (_minSpends[0] != 0) revert NoTiers();

        for (uint256 i = 0; i < _minSpends.length; i++) {
            if (_pricesPerToken[i] == 0) revert PriceZero();
            if (i > 0 && _minSpends[i] <= _minSpends[i-1]) revert UnsortedTiers();
        }

        delete tiers;
        for (uint256 j = 0; j < _minSpends.length; j++) {
            tiers.push(Tier({minSpend: _minSpends[j], pricePerToken: _pricesPerToken[j]}));
        }
        emit TiersUpdated(tiers.length);
    }

    function setLimits(uint256 _minPurchase, uint256 _maxPurchase, uint256 _hardCap) external onlyOwner {
        if (_maxPurchase != 0) require(_maxPurchase >= _minPurchase, "Max < min");
        if (_hardCap != 0) require(_hardCap >= totalRaised, "HardCap < raised");
        minPurchase = _minPurchase;
        maxPurchase = _maxPurchase;
        hardCapPayment = _hardCap;
        emit LimitsUpdated(_minPurchase, _maxPurchase, _hardCap);
    }

    function setReferralConfig(bool _enabled, uint256 _bonusBps) external onlyOwner {
        require(_bonusBps <= 2000, "Max 20%");
        referralEnabled = _enabled;
        referralBonusBps = _bonusBps;
        emit ReferralConfigUpdated(_enabled, _bonusBps);
    }

    function adminSetReferrer(address user, address referrer) external onlyOwner {
        if (user == address(0) || referrer == address(0)) revert ZeroAddress();
        if (user == referrer) revert SelfReferral();

        address currentReferrer = referrerOf[user];
        if (currentReferrer == referrer) return;

        if (hasUsedReferral[user]) {
            if (currentReferrer != address(0) && referredCount[currentReferrer] > 0) {
                referredCount[currentReferrer]--;
            }
            emit ReferrerRemoved(user, currentReferrer);
        }

        referrerOf[user] = referrer;
        referredCount[referrer]++;
        hasUsedReferral[user] = true;
        emit ReferralRegistered(referrer, user);
    }

    function adminRemoveReferrer(address user) external onlyOwner {
        address currentReferrer = referrerOf[user];
        if (currentReferrer != address(0)) {
            if (referredCount[currentReferrer] > 0) referredCount[currentReferrer]--;
            delete referrerOf[user];
            hasUsedReferral[user] = false;
            emit ReferrerRemoved(user, currentReferrer);
        }
    }

    function adminClearExpiredCommits(bytes32[] calldata commitHashes) external onlyOwner {
        for (uint256 i = 0; i < commitHashes.length; i++) {
            if (pendingReferrals[commitHashes[i]].timestamp + COMMIT_EXPIRY_TIME < block.timestamp) {
                delete pendingReferrals[commitHashes[i]];
            }
        }
    }

    function withdrawPayment(uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        paymentToken.safeTransfer(to, amount);
        emit WithdrawPayment(to, amount);
    }

    function withdrawUnsold(uint256 amount, address to) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        uint256 contractBalance = saleToken.balanceOf(address(this));
        uint256 availableToWithdraw = contractBalance > totalVestedCommitment ? contractBalance - totalVestedCommitment : 0;
        require(amount <= availableToWithdraw, "Cannot withdraw vested");
        saleToken.safeTransfer(to, amount);
        emit WithdrawUnsold(to, amount);
    }

    function rescueERC20(address token, address to, uint256 amount) external onlyOwner {
        if (to == address(0) || token == address(0)) revert ZeroAddress();
        IERC20(token).safeTransfer(to, amount);
        emit Rescue(token, to, amount);
    }

    function rescueETH(address to, uint256 amount) external onlyOwner {
        if (to == address(0)) revert ZeroAddress();
        (bool success,) = to.call{value: amount}("");
        require(success, "ETH transfer failed");
        emit Rescue(address(0), to, amount);
    }

    function _calcTokensOut(uint256 amountInPaymentToken, uint256 pricePerToken) internal view returns (uint256) {
        return (amountInPaymentToken * (10 ** uint256(saleTokenDecimals))) / pricePerToken;
    }

    function _tryGetDecimals(address token, uint8 fallback_) private view returns (uint8) {
        (bool success, bytes memory data) = token.staticcall(abi.encodeWithSelector(IERC20Metadata.decimals.selector));
        if (success && data.length >= 32) {
            uint256 decimals = abi.decode(data, (uint256));
            if (decimals > 0 && decimals <= 36) return uint8(decimals);
        }
        return fallback_;
    }

    receive() external payable {
        revert("No direct ETH");
    }
}
