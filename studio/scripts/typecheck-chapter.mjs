import path from 'node:path';
import ts from 'typescript';

const files = process.argv.slice(2).map((name) => path.resolve(name));
if (!files.length || files.some((file) => !ts.sys.fileExists(file) || !/\.tsx?$/.test(file))) {
  console.error('使い方: npm run typecheck:chapter -- <担当ファイル.tsx> [...]');
  process.exit(2);
}

const host = {
  ...ts.sys,
  getCanonicalFileName: (name) => ts.sys.useCaseSensitiveFileNames ? name : name.toLowerCase(),
  getNewLine: () => ts.sys.newLine,
  onUnRecoverableConfigFileDiagnostic: (error) => {
    console.error(ts.flattenDiagnosticMessageText(error.messageText, ts.sys.newLine));
    process.exit(2);
  },
};
const config = ts.getParsedCommandLineOfConfigFile('tsconfig.json', {}, host);
const program = ts.createProgram({
  rootNames: [...files, ...config.fileNames.filter((file) => file.endsWith('.d.ts'))],
  options: config.options,
  projectReferences: config.projectReferences,
});
const diagnostics = [...config.errors, ...ts.getPreEmitDiagnostics(program)];
if (diagnostics.length) {
  console.error(ts.formatDiagnostics(diagnostics, host));
  process.exitCode = 1;
}
