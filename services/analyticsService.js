// Helper function to analyze membership patterns
function analyzeMembershipPattern(periods) {
  if (!periods || periods.length === 0) {
    return {
      totalPeriods: 0,
      totalDays: 0,
      totalSpent: 0,
      averageDuration: 0,
      gaps: [],
      loyaltyScore: 0,
      membershipType: 'new'
    };
  }

  // Sort periods by start date
  const sortedPeriods = periods.sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
  
  // Calculate total days and spending
  let totalDays = 0;
  let totalSpent = 0;
  
  sortedPeriods.forEach(period => {
    const start = new Date(period.startDate);
    const end = new Date(period.endDate);
    const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24));
    totalDays += days;
    
    if (period.transaction) {
      totalSpent += period.transaction.amount;
    }
  });

  // Calculate gaps between periods
  const gaps = [];
  for (let i = 1; i < sortedPeriods.length; i++) {
    const prevEnd = new Date(sortedPeriods[i - 1].endDate);
    const currentStart = new Date(sortedPeriods[i].startDate);
    const gapDays = Math.ceil((currentStart - prevEnd) / (1000 * 60 * 60 * 24));
    
    if (gapDays > 0) {
      gaps.push({
        afterPeriod: i - 1,
        beforePeriod: i,
        days: gapDays,
        startDate: prevEnd,
        endDate: currentStart
      });
    }
  }

  // Calculate loyalty metrics
  const totalPeriods = periods.length;
  const averageDuration = totalPeriods > 0 ? totalDays / totalPeriods : 0;
  const totalGapDays = gaps.reduce((sum, gap) => sum + gap.days, 0);
  
  // Loyalty score calculation (0-100)
  let loyaltyScore = 0;
  if (totalPeriods >= 3) loyaltyScore += 30; // Repeat customer
  if (totalGapDays < 30) loyaltyScore += 25; // Short gaps
  if (averageDuration > 30) loyaltyScore += 25; // Long memberships
  if (totalSpent > 1000000) loyaltyScore += 20; // High value customer

  // Membership type classification
  let membershipType = 'new';
  if (totalPeriods >= 5) membershipType = 'loyal';
  else if (totalPeriods >= 3) membershipType = 'returning';
  else if (totalPeriods === 2) membershipType = 'second_time';

  return {
    totalPeriods,
    totalDays,
    totalSpent,
    averageDuration: Math.round(averageDuration),
    gaps,
    loyaltyScore: Math.min(100, loyaltyScore),
    membershipType,
    averageGapDays: gaps.length > 0 ? Math.round(totalGapDays / gaps.length) : 0
  };
}

module.exports = {
  analyzeMembershipPattern
};