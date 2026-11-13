/** NICEJOBS only publishes work created by verified MAXPASE group companies. */
export function isPublicInHouseOpportunity(engagement: string) {
  return ["PART_TIME_INCENTIVE", "PART_TIME", "FULL_TIME", "CONTRACT", "INTERNSHIP", "PERFORMANCE_BASED"].includes(engagement);
}
