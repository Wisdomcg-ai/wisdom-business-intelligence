// src/lib/kpi/data/functions/deliver-systems.ts

/**
 * DELIVER Business Function - Systems & Technology KPIs
 * Total: 15 KPIs
 * Covers: Technology uptime, automation, system integration, process efficiency, 
 *         digital maturity, DevOps metrics, security, disaster recovery
 * 
 * ✅ Uses 'function' instead of 'businessFunction'
 * ✅ All IDs prefixed with 'deliver-systems-'
 * ✅ String literals instead of enums
 * ✅ Updated all property names to match new schema
 */

import { KPIDefinition } from '../../types'
import {
  Server,
  Zap,
  Settings,
  GitMerge,
  TrendingUp,
  Shield,
  Clock,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Database,
  Cpu,
  Activity,
  BarChart3,
  Gauge
} from 'lucide-react'

export const deliverSystemsKPIs: KPIDefinition[] = [
  {
    id: 'deliver-systems-uptime',
    name: 'System Uptime',
    plainName: 'Percentage of Time Your Systems Are Available',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'daily',
    description: 'Percentage of time critical systems are operational and available to users',
    whyItMatters: 'Downtime costs revenue, damages reputation, and frustrates customers. Even 99% uptime means 3.65 days of downtime per year. Critical for digital businesses',
    actionToTake: 'Monitor 24/7 with automated alerts for outages. Track by system and time of day. Calculate downtime cost to justify infrastructure investments. Publish status page for transparency. SaaS targets 99.9% (8.7 hours/year downtime). E-commerce needs 99.95%. Critical systems: 99.99% (52 minutes/year). Build redundancy and failover capabilities',
    formula: '(Total Time - Downtime) / Total Time × 100',
    benchmarks: {
      poor: 95,
      average: 98,
      good: 99.5,
      excellent: 99.9
    },
    icon: Server,
    tags: ['uptime', 'availability', 'reliability', 'systems', 'sla'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-mttr',
    name: 'Mean Time to Recovery (MTTR)',
    plainName: 'Average Time to Fix System Problems',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'weekly',
    description: 'Average time from when a system failure is detected until it is fully resolved',
    whyItMatters: 'Fast recovery minimizes downtime impact. Long MTTR indicates poor monitoring, documentation, or incident response processes',
    actionToTake: 'Track by incident severity and system. Create runbooks for common issues. Implement automated rollback capabilities. Conduct post-mortems to improve processes. Target <2 hours MTTR. Critical systems: <30 minutes. Improve through automation, better monitoring, clear escalation paths, and comprehensive documentation',
    formula: 'Total Recovery Time / Number of Incidents',
    benchmarks: {
      poor: 8,
      average: 4,
      good: 2,
      excellent: 0.5
    },
    icon: RefreshCw,
    tags: ['mttr', 'recovery', 'incidents', 'reliability', 'downtime'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-mtbf',
    name: 'Mean Time Between Failures (MTBF)',
    plainName: 'Average Time Systems Run Before Failing',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'monthly',
    description: 'Average operational time between system or equipment failures',
    whyItMatters: 'Higher MTBF indicates more reliable systems, reducing operational disruption and maintenance costs. Key metric for infrastructure planning',
    actionToTake: 'Track by system and component. Low MTBF indicates maintenance needs or replacement requirements. Use for capacity planning and maintenance scheduling. Target varies by system type. Critical systems: 5000+ hours. Improve through preventive maintenance, quality components, and redundancy',
    formula: 'Total Operating Time / Number of Failures',
    benchmarks: {
      poor: 100,
      average: 500,
      good: 2000,
      excellent: 5000
    },
    icon: Activity,
    tags: ['mtbf', 'reliability', 'failures', 'systems', 'maintenance'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-automation-rate',
    name: 'Process Automation Rate',
    plainName: 'Percentage of Tasks Completed by Automation',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of routine business processes that are fully or partially automated',
    whyItMatters: 'Automation reduces errors, speeds processes, and frees people for higher-value work. Critical for scaling without proportional headcount increases',
    actionToTake: 'Identify repetitive tasks taking >2 hours/week. Prioritize automation by ROI. Start with data entry, reporting, and customer communications. Target 50%+ automation for scaling businesses. Focus on high-volume, rule-based tasks. Balance automation investment with strategic value',
    formula: '(Automated Process Steps / Total Process Steps) × 100',
    benchmarks: {
      poor: 20,
      average: 40,
      good: 60,
      excellent: 80
    },
    icon: Zap,
    tags: ['automation', 'efficiency', 'process', 'productivity', 'digital-transformation'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-integration-score',
    name: 'System Integration Score',
    plainName: 'How Well Your Systems Connect and Share Data',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'quarterly',
    description: 'Percentage of business systems that are integrated and automatically share data',
    whyItMatters: 'Poor integration creates data silos, manual work, and errors. Strong integration enables automation, real-time insights, and scalability',
    actionToTake: 'Map all systems and data flows. Prioritize integrations that eliminate manual data entry. Use APIs and middleware for robust connections. Target 70%+ integration. Prioritize CRM, accounting, and operations systems. Focus on bidirectional real-time sync for critical data',
    formula: '(Integrated System Connections / Total Possible Connections) × 100',
    benchmarks: {
      poor: 30,
      average: 50,
      good: 70,
      excellent: 90
    },
    icon: GitMerge,
    tags: ['integration', 'systems', 'connectivity', 'data-flow', 'architecture'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-api-response-time',
    name: 'API Response Time',
    plainName: 'How Fast Your Systems Respond to Requests',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: [
      'professional-services',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'milliseconds',
    frequency: 'daily',
    description: 'Average time for API endpoints to respond to requests',
    whyItMatters: 'Slow APIs degrade user experience and can cause timeouts. Critical for customer satisfaction and system reliability. Indicates performance optimization needs',
    actionToTake: 'Monitor P50, P95, and P99 percentiles. Set alerts for degradation. Optimize slow endpoints. Use caching and CDNs strategically. Target <200ms average, <500ms P95. Real-time apps need <100ms. Optimize database queries, add caching, use CDNs for static content',
    formula: 'Average API Response Time (milliseconds)',
    benchmarks: {
      poor: 1000,
      average: 500,
      good: 200,
      excellent: 100
    },
    icon: Gauge,
    tags: ['api', 'performance', 'response-time', 'speed', 'latency'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-database-performance',
    name: 'Database Query Performance',
    plainName: 'Average Time for Database Queries to Complete',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: [
      'professional-services',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'milliseconds',
    frequency: 'daily',
    description: 'Average execution time for database queries',
    whyItMatters: 'Database performance directly impacts application speed and user experience. Slow queries are often the primary bottleneck in system performance',
    actionToTake: 'Identify slow queries (>100ms). Add indexes, optimize joins, cache frequently accessed data. Monitor query patterns to prevent N+1 problems. Target <50ms average query time. Simple reads: <10ms. Complex reports: <500ms. Use query profiling tools and optimize worst offenders first',
    formula: 'Average Query Execution Time (milliseconds)',
    benchmarks: {
      poor: 500,
      average: 200,
      good: 50,
      excellent: 20
    },
    icon: Database,
    tags: ['database', 'performance', 'queries', 'optimization', 'speed'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-security-incidents',
    name: 'Security Incident Rate',
    plainName: 'Number of Security Issues or Breaches',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of security incidents, vulnerabilities, or breaches detected per month',
    whyItMatters: 'Security breaches damage reputation, cause financial loss, and create legal liability. Proactive security monitoring is essential for all businesses',
    actionToTake: 'Track by severity: critical, high, medium, low. Set target response times by severity. Conduct regular security audits and penetration testing. Target zero critical incidents. Detect and remediate all vulnerabilities within 30 days. Implement SOC 2 or ISO 27001 controls for enterprise customers',
    formula: 'Count of Security Incidents / Time Period',
    benchmarks: {
      poor: 10,
      average: 5,
      good: 2,
      excellent: 0
    },
    icon: Shield,
    tags: ['security', 'incidents', 'breaches', 'vulnerabilities', 'risk'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-patch-compliance',
    name: 'Patch Compliance Rate',
    plainName: 'Percentage of Systems With Latest Security Updates',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'weekly',
    description: 'Percentage of systems and software that are up-to-date with security patches',
    whyItMatters: 'Unpatched systems are primary attack vectors. High compliance reduces breach risk. Required for compliance certifications and cyber insurance',
    actionToTake: 'Automate patch management where possible. Set SLAs: critical patches within 7 days, high within 30 days. Test patches in staging first. Target 95%+ compliance. Critical patches: 100% within 7 days. Automate patching for non-critical systems. Maintain test environment for validation',
    formula: '(Systems Fully Patched / Total Systems) × 100',
    benchmarks: {
      poor: 75,
      average: 85,
      good: 95,
      excellent: 99
    },
    icon: Shield,
    tags: ['patching', 'security', 'compliance', 'updates', 'vulnerability-management'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-backup-success',
    name: 'Backup Success Rate',
    plainName: 'Percentage of Scheduled Backups That Complete Successfully',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'essential',
    industries: ['all'],
    stages: [
      'foundation',
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'daily',
    description: 'Percentage of scheduled data backups that complete without errors',
    whyItMatters: 'Failed backups leave you vulnerable to data loss. Critical for business continuity and disaster recovery. Many businesses discover backup failures only during recovery attempts',
    actionToTake: 'Monitor backup jobs daily. Test restore process quarterly. Failed backup = critical alert. Maintain offsite/cloud copies. Document restore procedures. Target 99%+ success rate. Any failure requires immediate investigation. Test restores monthly. Follow 3-2-1 rule: 3 copies, 2 media types, 1 offsite',
    formula: '(Successful Backups / Total Scheduled Backups) × 100',
    benchmarks: {
      poor: 90,
      average: 95,
      good: 98,
      excellent: 99.5
    },
    icon: Database,
    tags: ['backup', 'disaster-recovery', 'data-protection', 'reliability', 'business-continuity'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-recovery-time',
    name: 'Recovery Time Objective (RTO)',
    plainName: 'Maximum Time to Restore Systems After Failure',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: ['all'],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'hours',
    frequency: 'quarterly',
    description: 'Target maximum time to restore systems and data after a disaster or major failure',
    whyItMatters: 'Defines how quickly you must recover to avoid significant business impact. Used for disaster recovery planning and infrastructure investment decisions',
    actionToTake: 'Set RTO by system criticality. Test recovery procedures quarterly. Invest in redundancy for systems with low RTO requirements. Document recovery playbooks. Critical systems: <4 hours. Important systems: <24 hours. Test recovery to validate RTO targets. Consider hot standby for mission-critical systems',
    formula: 'Target Maximum Recovery Time (hours)',
    benchmarks: {
      poor: 48,
      average: 24,
      good: 8,
      excellent: 1
    },
    icon: Clock,
    tags: ['rto', 'disaster-recovery', 'recovery-time', 'business-continuity', 'resilience'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-cloud-efficiency',
    name: 'Cloud Cost Efficiency',
    plainName: 'Cloud Spending Relative to Usage and Value',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: [
      'professional-services',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Ratio of actual cloud resource utilization to provisioned/paid capacity',
    whyItMatters: 'Cloud costs can spiral without active management. Typical companies waste 30% of cloud spend on idle resources. Direct impact on profitability',
    actionToTake: 'Right-size instances, use reserved capacity, turn off dev/test resources, implement autoscaling. Review monthly. Set budget alerts. Target 70%+ utilization. Use reserved instances for predictable workload (40-60% savings). Implement auto-scaling. Review costs weekly in growth phase',
    formula: '(Actual Resource Utilization / Provisioned Capacity) × 100',
    benchmarks: {
      poor: 40,
      average: 60,
      good: 75,
      excellent: 85
    },
    icon: TrendingUp,
    tags: ['cloud-costs', 'efficiency', 'optimization', 'waste-reduction', 'finops'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-technical-debt',
    name: 'Technical Debt Ratio',
    plainName: 'Cost to Fix Code Issues vs. Cost to Build',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'advanced',
    industries: [
      'professional-services',
      'all'
    ],
    stages: [
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Estimated cost to remediate code quality issues as a percentage of the system\'s value',
    whyItMatters: 'High technical debt slows feature development, increases bugs, and makes scaling difficult. Must be managed actively to maintain development velocity',
    actionToTake: 'Use code analysis tools to quantify debt. Allocate 15-20% of sprint capacity to debt reduction. Prioritize debt that blocks new features or causes bugs. Target <5% debt ratio. Above 10% significantly impacts velocity. Dedicate 1-2 sprints per quarter to debt reduction. Prevent new debt through code reviews',
    formula: '(Remediation Cost / Development Cost) × 100',
    benchmarks: {
      poor: 20,
      average: 10,
      good: 5,
      excellent: 2
    },
    icon: Settings,
    tags: ['technical-debt', 'code-quality', 'maintainability', 'development', 'software'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-deployment-frequency',
    name: 'Deployment Frequency',
    plainName: 'How Often You Release Software Updates',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: [
      'professional-services',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'number',
    frequency: 'monthly',
    description: 'Number of production deployments per time period',
    whyItMatters: 'High deployment frequency indicates mature DevOps practices and ability to deliver value quickly. Elite performers deploy multiple times per day',
    actionToTake: 'Automate deployment pipeline. Implement continuous integration/deployment. Use feature flags. Smaller, frequent deploys reduce risk vs. large infrequent releases. Early stage: weekly deploys. Growth: daily deploys. Elite: multiple per day. Automate testing and deployment. Use canary or blue-green deployments',
    formula: 'Count of Production Deployments / Time Period',
    benchmarks: {
      poor: 1,
      average: 4,
      good: 20,
      excellent: 100
    },
    icon: RefreshCw,
    tags: ['deployment', 'devops', 'releases', 'agility', 'ci-cd'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  },

  {
    id: 'deliver-systems-change-failure',
    name: 'Change Failure Rate',
    plainName: 'Percentage of Deployments That Cause Problems',
    function: 'DELIVER',
    category: 'Systems',
    tier: 'recommended',
    industries: [
      'professional-services',
      'retail-ecommerce',
      'all'
    ],
    stages: [
      'traction',
      'growth',
      'scale',
      'optimization',
      'leadership'
    ],
    unit: 'percentage',
    frequency: 'monthly',
    description: 'Percentage of production deployments that result in degraded service or require rollback',
    whyItMatters: 'High failure rate indicates insufficient testing, poor quality processes, or rushing deployments. Failures damage user experience and team confidence',
    actionToTake: 'Track root causes of failures. Improve automated testing coverage. Implement staged rollouts. Use feature flags to decouple deploy from release. Target <5% failure rate. Elite performers achieve <1%. Improve through better testing, staging environments, and gradual rollouts. Monitor closely post-deploy',
    formula: '(Failed Deployments / Total Deployments) × 100',
    benchmarks: {
      poor: 30,
      average: 15,
      good: 5,
      excellent: 1
    },
    icon: AlertTriangle,
    tags: ['change-failure', 'deployment', 'quality', 'devops', 'reliability'],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  }
]