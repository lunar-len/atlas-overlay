import fs from "fs";
import path from "path";
import process from "process";
import prompts from "prompts";

const MODULE_ID = "atlas-overlay";
const windowsNote = process.platform === "win32" ? ' Start with a drive letter ("C:\\").' : "";

(async () => {
    const dataPath = (
        await prompts({
            type: "text",
            name: "value",
            format: (v) => v.replace(/\W*$/, "").trim(),
            message: `Enter the full path to your Foundry Data folder.${windowsNote}`,
        })
    ).value;

    if (!dataPath || !/\bData$/.test(dataPath)) {
        console.error(`"${dataPath}" does not look like a Foundry Data folder.`);
        process.exit(1);
    }
    if (!fs.lstatSync(dataPath, { throwIfNoEntry: false })?.isDirectory()) {
        console.error(`No folder found at "${dataPath}"`);
        process.exit(1);
    }

    const symlinkPath = path.resolve(dataPath, "modules", MODULE_ID);
    const symlinkStats = fs.lstatSync(symlinkPath, { throwIfNoEntry: false });

    if (symlinkStats) {
        const kind = symlinkStats.isDirectory() ? "folder" : symlinkStats.isSymbolicLink() ? "symlink" : "file";
        const proceed = (
            await prompts({
                type: "confirm",
                name: "value",
                initial: false,
                message: `A "${MODULE_ID}" ${kind} already exists in the "modules" subfolder. Replace with new symlink?`,
            })
        ).value;
        if (!proceed) { console.log("Aborting."); process.exit(); }
    }

    try {
        if (symlinkStats?.isDirectory()) fs.rmSync(symlinkPath, { recursive: true, force: true });
        else if (symlinkStats) fs.unlinkSync(symlinkPath);
        fs.symlinkSync(path.resolve(process.cwd()), symlinkPath);
    } catch (error) {
        console.error(`Error creating symlink: ${error.message}`);
        process.exit(1);
    }

    console.log(`Symlink created at "${symlinkPath}"`);
})();
