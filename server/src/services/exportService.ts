import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from 'docx';
import ExcelJS from 'exceljs';

interface ReportData {
  summary: string;
  completedTasks: number;
  inProgressTasks: number;
  pendingTasks: number;
  totalTasks?: number;
  completionRate?: number;
  categories: {
    name: string;
    tasks: {
      title: string;
      status: string;
      subStatus?: string;
      progress?: string;
      completedAt?: string;
    }[];
  }[];
  insights?: string[];
  nextSteps: string[];
  highlights?: string[];
  risks?: string[];
}

export async function exportToWord(report: ReportData, reportType: string): Promise<Buffer> {
  const { summary, completedTasks, inProgressTasks, pendingTasks, totalTasks, completionRate, categories, insights, nextSteps, highlights, risks } = report;

  const children: Paragraph[] = [];

  // Title
  children.push(
    new Paragraph({
      text: `采购部门${reportType}`,
      heading: HeadingLevel.TITLE,
      alignment: AlignmentType.CENTER,
    })
  );

  // Summary
  children.push(
    new Paragraph({
      text: '一、执行摘要',
      heading: HeadingLevel.HEADING_1,
    })
  );
  children.push(
    new Paragraph({
      text: summary,
    })
  );

  // Statistics
  children.push(
    new Paragraph({
      text: '二、关键数据',
      heading: HeadingLevel.HEADING_1,
    })
  );
  children.push(
    new Paragraph({
      children: [
        new TextRun({ text: `总任务数: ${totalTasks || (completedTasks + inProgressTasks + pendingTasks)}  |  ` }),
        new TextRun({ text: `已完成: ${completedTasks}  |  ` }),
        new TextRun({ text: `进行中: ${inProgressTasks}  |  ` }),
        new TextRun({ text: `待处理: ${pendingTasks}  |  ` }),
        new TextRun({ text: `完成率: ${completionRate || Math.round((completedTasks / (totalTasks || (completedTasks + inProgressTasks + pendingTasks))) * 100)}%` }),
      ],
    })
  );

  // Highlights
  if (highlights && highlights.length > 0) {
    children.push(
      new Paragraph({
        text: '三、工作亮点',
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const highlight of highlights) {
      children.push(
        new Paragraph({
          text: `• ${highlight}`,
        })
      );
    }
  }

  // Risks
  if (risks && risks.length > 0) {
    children.push(
      new Paragraph({
        text: '四、风险与问题',
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const risk of risks) {
      children.push(
        new Paragraph({
          text: `• ${risk}`,
        })
      );
    }
  }

  // Category details
  children.push(
    new Paragraph({
      text: '五、任务详情',
      heading: HeadingLevel.HEADING_1,
    })
  );

  for (const category of categories) {
    if (category.tasks.length > 0) {
      children.push(
        new Paragraph({
          text: `【${category.name}】`,
          heading: HeadingLevel.HEADING_2,
        })
      );

      for (const task of category.tasks) {
        const statusText = task.status === 'COMPLETED' ? '✓已完成' : task.status === 'IN_PROGRESS' ? '◐进行中' : '○待处理';
        const subStatusText = task.subStatus && task.status !== 'COMPLETED' ? `(${task.subStatus})` : '';
        const progressText = task.progress ? ` - ${task.progress}` : '';
        children.push(
          new Paragraph({
            text: `• ${task.title} ${statusText} ${subStatusText}${progressText}`,
          })
        );
      }
    }
  }

  // Next steps
  if (nextSteps && nextSteps.length > 0) {
    children.push(
      new Paragraph({
        text: '六、下阶段计划',
        heading: HeadingLevel.HEADING_1,
      })
    );
    for (const step of nextSteps) {
      children.push(
        new Paragraph({
          text: `• ${step}`,
        })
      );
    }
  }

  const doc = new Document({
    sections: [{
      properties: {},
      children,
    }],
  });

  return await Packer.toBuffer(doc);
}

export async function exportToExcel(report: ReportData, reportType: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = '采购工作站';
  workbook.created = new Date();

  // Summary Sheet
  const summarySheet = workbook.addWorksheet('工作总结');
  summarySheet.columns = [
    { header: '项目', key: 'item', width: 20 },
    { header: '内容', key: 'content', width: 60 },
  ];

  summarySheet.addRow({ item: '报告类型', content: `采购部门${reportType}` });
  summarySheet.addRow({ item: '总任务数', content: report.totalTasks || (report.completedTasks + report.inProgressTasks + report.pendingTasks) });
  summarySheet.addRow({ item: '已完成', content: report.completedTasks });
  summarySheet.addRow({ item: '进行中', content: report.inProgressTasks });
  summarySheet.addRow({ item: '待处理', content: report.pendingTasks });
  summarySheet.addRow({ item: '完成率', content: `${report.completionRate || 0}%` });

  summarySheet.addRow({ item: '', content: '' });
  summarySheet.addRow({ item: '执行摘要', content: report.summary });

  if (report.highlights && report.highlights.length > 0) {
    summarySheet.addRow({ item: '', content: '' });
    summarySheet.addRow({ item: '工作亮点', content: report.highlights.join('; ') });
  }

  if (report.risks && report.risks.length > 0) {
    summarySheet.addRow({ item: '', content: '' });
    summarySheet.addRow({ item: '风险与问题', content: report.risks.join('; ') });
  }

  // Tasks Sheet
  const tasksSheet = workbook.addWorksheet('任务详情');
  tasksSheet.columns = [
    { header: '分类', key: 'category', width: 15 },
    { header: '任务名称', key: 'title', width: 30 },
    { header: '状态', key: 'status', width: 15 },
    { header: '子状态', key: 'subStatus', width: 20 },
    { header: '进度', key: 'progress', width: 20 },
    { header: '完成时间', key: 'completedAt', width: 15 },
  ];

  for (const category of report.categories) {
    for (const task of category.tasks) {
      const statusText = task.status === 'COMPLETED' ? '已完成' : task.status === 'IN_PROGRESS' ? '进行中' : '待处理';
      tasksSheet.addRow({
        category: category.name,
        title: task.title,
        status: statusText,
        subStatus: task.subStatus || '',
        progress: task.progress || '',
        completedAt: task.completedAt ? new Date(task.completedAt).toLocaleDateString() : '',
      });
    }
  }

  // Style header row
  tasksSheet.getRow(1).font = { bold: true };
  tasksSheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1890FF' } };

  // Insights/Next Steps Sheet
  if (report.nextSteps && report.nextSteps.length > 0) {
    const nextStepsSheet = workbook.addWorksheet('下阶段计划');
    nextStepsSheet.columns = [
      { header: '序号', key: 'index', width: 10 },
      { header: '计划内容', key: 'step', width: 50 },
    ];

    report.nextSteps.forEach((step, index) => {
      nextStepsSheet.addRow({ index: index + 1, step });
    });

    nextStepsSheet.getRow(1).font = { bold: true };
  }

  return await workbook.xlsx.writeBuffer() as unknown as Buffer;
}