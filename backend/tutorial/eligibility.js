// C02 teaching fixture only. Not EShop source or the common baseline.
// Demo contract: a finite nonnegative total qualifies at or above minimum.
module.exports = function eligible(total, minimum) {
  return total >= minimum;
};

