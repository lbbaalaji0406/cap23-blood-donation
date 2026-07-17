import { requestService } from './requestService';
import type { DonationRequest } from './requestService';
import { auditLogService } from './auditLogService';
import type { AuditLog } from './auditLogService';
import { getBloodGroups } from './masterService';
import * as XLSX from 'xlsx';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';

export interface SummaryStats {
  totalRequests: number;
  statusCounts: Record<string, number>;
  bloodGroupCounts: Record<string, number>;
  totalUnitsNeeded: number;
}

export const reportService = {
  getSummaryReport: async (
    role: string,
    campIdFilter: string,
    startDate: number,
    endDate: number
  ): Promise<SummaryStats> => {
    const requests = await requestService.getAllRequests(role, role === 'Manager' ? campIdFilter : (campIdFilter || undefined));
    const bloodGroups = await getBloodGroups();
    
    // Filter by date range
    const filtered = requests.filter(r => r.createdAt >= startDate && r.createdAt <= endDate);
    
    const stats: SummaryStats = {
      totalRequests: filtered.length,
      statusCounts: {},
      bloodGroupCounts: {},
      totalUnitsNeeded: 0
    };
    
    filtered.forEach(r => {
      stats.statusCounts[r.status] = (stats.statusCounts[r.status] || 0) + 1;
      const bgName = bloodGroups[r.blood_groupId]?.name || r.blood_groupId;
      stats.bloodGroupCounts[bgName] = (stats.bloodGroupCounts[bgName] || 0) + 1;
      stats.totalUnitsNeeded += r.unitsNeeded || 0;
    });
    
    return stats;
  },

  getStatusReport: async (role: string, campIdFilter: string): Promise<DonationRequest[]> => {
    const requests = await requestService.getAllRequests(role, role === 'Manager' ? campIdFilter : (campIdFilter || undefined));
    // Filter to only non-terminal statuses
    return requests.filter(r => r.status !== 'Closed' && r.status !== 'Unfulfilled');
  },

  getActivityReport: async (
    role: string,
    campIdFilter: string,
    startDate: number,
    endDate: number
  ): Promise<AuditLog[]> => {
    let allLogs: AuditLog[] = [];
    
    if (role === 'Admin' && !campIdFilter) {
      // Admin global fetch (would require full auditLogs read, but we don't have a global fetch in auditLogService yet)
      // Since auditLogService only exports getLogsForTransaction, we will reuse the request loop to avoid schema changes
      const requests = await requestService.getAllRequests(role);
      const promises = requests.map(req => auditLogService.getLogsForTransaction(req.id).catch(() => []));
      const results = await Promise.all(promises);
      allLogs = results.flat();
    } else {
      // Manager (or Admin filtering for one camp)
      const targetCamp = role === 'Manager' ? campIdFilter : campIdFilter;
      const requests = await requestService.getAllRequests(role, targetCamp);
      
      const promises = requests.map(req => auditLogService.getLogsForTransaction(req.id).catch(() => []));
      const results = await Promise.all(promises);
      allLogs = results.flat();
    }
    
    // Filter by date range and sort
    const filtered = allLogs.filter(log => log.createdAt >= startDate && log.createdAt <= endDate);
    filtered.sort((a, b) => b.createdAt - a.createdAt);
    return filtered;
  },

  exportToExcel: (data: any[], filename: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Report");
    XLSX.writeFile(workbook, `${filename}.xlsx`);
  },

  exportToPDF: (title: string, columns: string[], data: any[][], filename: string) => {
    const doc = new jsPDF();
    doc.text(title, 14, 15);
    autoTable(doc, {
      startY: 20,
      head: [columns],
      body: data,
    });
    doc.save(`${filename}.pdf`);
  }
};
