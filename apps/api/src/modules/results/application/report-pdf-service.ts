import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from 'pdf-lib';

import { NotFoundError } from '../../../app/errors/app-error.js';
import { StudentModel } from '../../students/infrastructure/student-models.js';
import { formatHundredths } from '../domain/result-engine.js';
import { TermReportModel, type TermReportRecord } from '../infrastructure/result-models.js';

const PAGE_WIDTH = 595.28;
const PAGE_HEIGHT = 841.89;
const MARGIN = 48;

function pdfSafe(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/gu, '')
    .replace(/[^\x20-\x7E]/gu, '');
}

function drawText(
  page: PDFPage,
  font: PDFFont,
  text: string,
  x: number,
  y: number,
  options?: { color?: ReturnType<typeof rgb>; size?: number },
): void {
  page.drawText(pdfSafe(text), {
    color: options?.color ?? rgb(0.08, 0.13, 0.22),
    font,
    size: options?.size ?? 9,
    x,
    y,
  });
}

export class ReportPdfService {
  public async generateOwnReport(userId: string, reportId: string): Promise<Uint8Array> {
    const student = await StudentModel.findOne({ userId }).select('_id').lean();
    if (student === null) throw new NotFoundError();
    const report = await TermReportModel.findOne({
      _id: reportId,
      current: true,
      status: 'PUBLISHED',
      studentId: student._id,
    }).lean();
    if (report === null) throw new NotFoundError();
    return this.generate(report);
  }

  public async generateAuthorizedReport(reportId: string): Promise<Uint8Array> {
    const report = await TermReportModel.findOne({ _id: reportId, status: 'PUBLISHED' }).lean();
    if (report === null) throw new NotFoundError();
    return this.generate(report);
  }

  public async generate(report: TermReportRecord): Promise<Uint8Array> {
    const document = await PDFDocument.create();
    document.setTitle(`${report.termName} report card - ${report.studentIdentifier}`);
    document.setAuthor(report.schoolName);
    document.setSubject('Official term report card');
    document.setCreationDate(report.publishedAt ?? new Date());
    const regular = await document.embedFont(StandardFonts.Helvetica);
    const bold = await document.embedFont(StandardFonts.HelveticaBold);
    let page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - MARGIN;

    const newPage = (): void => {
      page = document.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      y = PAGE_HEIGHT - MARGIN;
      drawText(page, bold, `${report.schoolName} - Term Report`, MARGIN, y, { size: 12 });
      y -= 26;
    };

    drawText(page, bold, report.schoolName, MARGIN, y, {
      color: rgb(0.04, 0.1, 0.2),
      size: 20,
    });
    y -= 24;
    drawText(page, regular, 'Official Term Report Card', MARGIN, y, {
      color: rgb(0.6, 0.39, 0.06),
      size: 12,
    });
    y -= 32;

    const identityRows: [string, string][] = [
      ['Student', report.studentDisplayName],
      ['Student ID', report.studentIdentifier],
      ['Academic session', report.sessionLabel],
      ['Term', report.termName],
      ['Class', report.classLevelName],
    ];
    if (report.trackName !== undefined) identityRows.push(['Track', report.trackName]);
    for (const [label, value] of identityRows) {
      drawText(page, bold, `${label}:`, MARGIN, y);
      drawText(page, regular, value, MARGIN + 110, y);
      y -= 18;
    }
    y -= 14;

    drawText(page, bold, 'Subject', MARGIN, y, { size: 9 });
    drawText(page, bold, 'Assessment', 245, y, { size: 9 });
    drawText(page, bold, 'Total', 392, y, { size: 9 });
    drawText(page, bold, 'Grade', 468, y, { size: 9 });
    y -= 8;
    page.drawLine({
      color: rgb(0.72, 0.75, 0.79),
      end: { x: PAGE_WIDTH - MARGIN, y },
      start: { x: MARGIN, y },
      thickness: 0.7,
    });
    y -= 15;

    for (const subject of report.subjects) {
      if (y < 95) newPage();
      const componentSummary = subject.exempt
        ? 'Exempt'
        : subject.components
            .map((component) =>
              component.state === 'ABSENT'
                ? `${component.label}: Absent`
                : `${component.label}: ${formatHundredths(component.scoreHundredths ?? 0)}/${formatHundredths(component.maximumHundredths)}`,
            )
            .join(', ');
      drawText(page, regular, `${subject.subjectName} (${subject.subjectCode})`, MARGIN, y);
      drawText(page, regular, componentSummary.slice(0, 37), 245, y, { size: 8 });
      drawText(
        page,
        regular,
        subject.exempt || subject.totalHundredths === undefined
          ? '-'
          : formatHundredths(subject.totalHundredths),
        392,
        y,
      );
      drawText(page, bold, subject.exempt ? 'EXEMPT' : (subject.grade ?? '-'), 468, y);
      y -= 21;
    }
    y -= 6;
    page.drawLine({
      color: rgb(0.72, 0.75, 0.79),
      end: { x: PAGE_WIDTH - MARGIN, y },
      start: { x: MARGIN, y },
      thickness: 0.7,
    });
    y -= 24;
    drawText(page, bold, `Overall average: ${report.overallAverageRounded}%`, MARGIN, y, {
      size: 11,
    });
    if (report.classPosition !== undefined) {
      drawText(
        page,
        bold,
        `Class position: ${String(report.classPosition)} of ${String(report.classPositionCohortSize ?? '-')}`,
        320,
        y,
        { size: 11 },
      );
    }
    y -= 30;
    if (report.classTeacherRemark !== undefined) {
      drawText(page, bold, 'Class teacher remark', MARGIN, y);
      y -= 16;
      drawText(page, regular, report.classTeacherRemark.slice(0, 100), MARGIN, y);
      y -= 25;
    }
    if (report.principalRemark !== undefined) {
      drawText(page, bold, 'Principal / administrator remark', MARGIN, y);
      y -= 16;
      drawText(page, regular, report.principalRemark.slice(0, 100), MARGIN, y);
      y -= 25;
    }
    drawText(
      page,
      regular,
      `Published ${report.publishedAt?.toISOString().slice(0, 10) ?? ''} | Report version ${String(report.publicationVersion)}`,
      MARGIN,
      Math.max(y - 12, 44),
      { color: rgb(0.38, 0.42, 0.48), size: 8 },
    );
    return document.save();
  }
}
