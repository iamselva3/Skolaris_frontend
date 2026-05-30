import { useState, useRef } from 'react';
import Papa from 'papaparse';
import * as XLSX from 'xlsx';
import { toast } from 'sonner';
import { Upload, CheckCircle2, AlertCircle } from 'lucide-react';
import { studentsApi } from '@/lib/api/students.api';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import type { ColumnDef } from '@tanstack/react-table';

interface ImportStudentsModalProps {
  open: boolean;
  branchOptions: Array<{ id: string; name: string }>;
  isSuperAdmin: boolean;
  userBranchId?: string;
  onClose: () => void;
  onImported: () => void;
}

interface ParsedStudent {
  email: string;
  name: string;
  password?: string;
  branchName: string;
  branchId?: string;
  classLabel?: string;
  rollNo?: string;
  parentContact?: string;
  error?: string;
}

export const ImportStudentsModal = ({ open, branchOptions, isSuperAdmin, userBranchId, onClose, onImported }: ImportStudentsModalProps) => {
  const [parsedData, setParsedData] = useState<ParsedStudent[] | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [importProgress, setImportProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setParsedData(null);
    setIsImporting(false);
    setImportProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const processData = (data: any[]) => {
    const mappedData: ParsedStudent[] = data.map((row: any) => {
      const branchMatch = isSuperAdmin
        ? branchOptions.find((b) => b.name.toLowerCase() === (row.branch || '').trim().toLowerCase())
        : branchOptions.find((b) => b.id === userBranchId);

      let error = '';
      if (!row.email) error = 'Email missing';
      else if (!row.name) error = 'Name missing';
      else if (!row.password) error = 'Password missing';
      else if (isSuperAdmin && !branchMatch) error = `Branch not found: ${row.branch}`;
      else if (!isSuperAdmin && !branchMatch) error = 'Your branch could not be resolved.';

      return {
        email: row.email?.trim() || '',
        name: row.name?.trim() || '',
        password: row.password?.trim() || '',
        branchName: isSuperAdmin ? (row.branch?.trim() || '') : (branchMatch?.name || ''),
        branchId: branchMatch?.id,
        classLabel: row.classLabel?.trim() || '',
        rollNo: row.rollNo?.trim() || '',
        parentContact: row.parentContact?.trim() || '',
        error: error || undefined,
      };
    });

    setParsedData(mappedData);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.name.endsWith('.csv')) {
      Papa.parse(file, {
        header: true,
        skipEmptyLines: true,
        transformHeader: (header) => {
          const lower = header.toLowerCase().trim();
          if (lower.includes('email')) return 'email';
          if (lower.includes('name')) return 'name';
          if (lower.includes('password')) return 'password';
          if (lower.includes('branch')) return 'branch';
          if (lower.includes('class')) return 'classLabel';
          if (lower.includes('roll')) return 'rollNo';
          if (lower.includes('contact') || lower.includes('parent')) return 'parentContact';
          return lower;
        },
        complete: (results) => {
          processData(results.data);
        },
        error: (error) => {
          toast.error(`Error parsing CSV: ${error.message}`);
        },
      });
    } else if (file.name.match(/\.xls(x)?$/)) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        try {
          const bstr = evt.target?.result;
          const workbook = XLSX.read(bstr, { type: 'binary' });
          const firstSheetName = workbook.SheetNames[0];
          const worksheet = workbook.Sheets[firstSheetName];
          const rows = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
          
          if (rows.length < 2) {
            toast.error('File is empty or missing headers');
            return;
          }
          
          const rawHeaders = rows[0] as string[];
          const mappedHeaders = rawHeaders.map(header => {
            if (typeof header !== 'string') return '';
            const lower = header.toLowerCase().trim();
            if (lower.includes('email')) return 'email';
            if (lower.includes('name')) return 'name';
            if (lower.includes('password')) return 'password';
            if (lower.includes('branch')) return 'branch';
            if (lower.includes('class')) return 'classLabel';
            if (lower.includes('roll')) return 'rollNo';
            if (lower.includes('contact') || lower.includes('parent')) return 'parentContact';
            return lower;
          });

          const data = [];
          for (let i = 1; i < rows.length; i++) {
            const row = rows[i];
            if (!row || row.length === 0 || row.every(cell => cell === undefined || cell === null || cell === '')) continue;
            
            const obj: any = {};
            for (let j = 0; j < mappedHeaders.length; j++) {
              if (mappedHeaders[j]) {
                obj[mappedHeaders[j]] = row[j] !== undefined && row[j] !== null ? String(row[j]) : undefined;
              }
            }
            data.push(obj);
          }
          
          processData(data);
        } catch (error: any) {
          toast.error(`Error parsing Excel: ${error.message}`);
        }
      };
      reader.readAsBinaryString(file);
    } else {
      toast.error('Please upload a .csv, .xls, or .xlsx file');
    }
  };

  const handleImport = async () => {
    if (!parsedData) return;

    const validStudents = parsedData.filter((s) => !s.error && s.branchId);
    if (validStudents.length === 0) {
      toast.error('No valid students to import.');
      return;
    }

    setIsImporting(true);
    let successCount = 0;
    let errorCount = 0;

    for (let i = 0; i < validStudents.length; i++) {
      const s = validStudents[i];
      try {
        await studentsApi.create({
          email: s.email,
          name: s.name,
          password: s.password!,
          branchId: s.branchId!,
          classLabel: s.classLabel || undefined,
          rollNo: s.rollNo || undefined,
          parentContact: s.parentContact || undefined,
        });
        successCount++;
      } catch (err: any) {
        errorCount++;
        console.error('Failed to import student', s.email, err);
      }
      setImportProgress(Math.round(((i + 1) / validStudents.length) * 100));
    }

    setIsImporting(false);
    toast.success(`Import complete. ${successCount} added, ${errorCount} failed.`);
    onImported();
    handleClose();
  };

  const columns: ColumnDef<ParsedStudent>[] = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Email', accessorKey: 'email' },
    { header: 'Branch', accessorKey: 'branchName' },
    {
      header: 'Status',
      cell: (c) => {
        const error = c.row.original.error;
        if (error) {
          return (
            <span className="inline-flex items-center text-xs font-medium text-danger">
              <AlertCircle size={12} className="mr-1" /> {error}
            </span>
          );
        }
        return (
          <span className="inline-flex items-center text-xs font-medium text-success">
            <CheckCircle2 size={12} className="mr-1" /> Ready
          </span>
        );
      },
    },
  ];

  return (
    <Modal
      open={open}
      title="Import students"
      onClose={handleClose}
      size={parsedData ? 'xl' : 'md'}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isImporting}>
            Cancel
          </Button>
          {parsedData && (
            <Button
              variant="primary"
              onClick={handleImport}
              disabled={isImporting || parsedData.filter((s) => !s.error).length === 0}
              loading={isImporting}
            >
              Confirm & Add {parsedData.filter((s) => !s.error).length}
            </Button>
          )}
        </>
      }
    >
      {!parsedData ? (
        <div className="flex flex-col items-center justify-center p-8 text-center">
          <Upload className="mb-4 text-primary" size={32} />
          <h3 className="mb-2 text-base font-semibold">Upload a CSV or Excel file</h3>
          <p className="mb-6 text-sm text-text-muted">
            The file must contain: <b>Email, Fullname, Initial Password{isSuperAdmin ? ', Branch' : ''}</b>. Optional: <b>Roll No, Class Label, Parent Contact</b>.
          </p>
          <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>
            Select CSV or Excel File
          </Button>
          <input
            type="file"
            accept=".csv, .xls, .xlsx"
            ref={fileInputRef}
            className="hidden"
            onChange={handleFileUpload}
          />
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">
              Found {parsedData.length} records. {parsedData.filter((s) => !s.error).length} are ready to import.
            </p>
            {!isImporting && (
              <Button variant="secondary" size="sm" onClick={reset}>
                Upload different file
              </Button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto rounded-md border border-border">
            <Table columns={columns} data={parsedData} empty={<p>No valid data found</p>} />
          </div>

          {isImporting && (
            <div className="mt-4">
              <div className="mb-1 flex justify-between text-xs text-text-muted">
                <span>Importing...</span>
                <span>{importProgress}%</span>
              </div>
              <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-hover">
                <div
                  className="h-full bg-primary transition-all duration-300"
                  style={{ width: `${importProgress}%` }}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
};
