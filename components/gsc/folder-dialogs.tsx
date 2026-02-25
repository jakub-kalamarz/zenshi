import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectLabel,
  SelectGroup,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ArrowsLeftRight,
  FolderOpen,
  FolderPlus,
  GlobeHemisphereWest,
  PencilSimple,
  Trash,
} from "@phosphor-icons/react";
import { useTranslations } from "next-intl";
import type { Folder } from "./types";
import type { Site } from "@/components/site-card";
import { FolderVisualFields } from "./folder-visual-fields";
import { displaySiteName } from "./date-utils";

export type FolderDialogsProps = {
  folders: Folder[];
  sortedFolders: Folder[];
  sortedSites: Site[];

  folderCreateOpen: boolean;
  onFolderCreateOpenChange: (open: boolean) => void;
  folderCreateName: string;
  onFolderCreateNameChange: (value: string) => void;
  folderCreateIcon: string;
  onFolderCreateIconChange: (value: string) => void;
  folderCreateColor: string;
  onFolderCreateColorChange: (value: string) => void;
  onCreateFolder: () => void;

  folderRenameOpen: boolean;
  onFolderRenameOpenChange: (open: boolean) => void;
  folderRenameId: string | null;
  onFolderRenameIdChange: (value: string) => void;
  folderRenameName: string;
  onFolderRenameNameChange: (value: string) => void;
  folderRenameIcon: string;
  onFolderRenameIconChange: (value: string) => void;
  folderRenameColor: string;
  onFolderRenameColorChange: (value: string) => void;
  onRenameFolder: () => void;

  folderDeleteOpen: boolean;
  onFolderDeleteOpenChange: (open: boolean) => void;
  folderDeleteId: string | null;
  onFolderDeleteIdChange: (value: string) => void;
  onDeleteFolder: () => void;

  moveOpen: boolean;
  onMoveOpenChange: (open: boolean) => void;
  moveSiteIds: string[];
  onMoveSiteIdsChange: (ids: string[]) => void;
  onToggleMoveSiteId: (siteId: string, checked: boolean) => void;
  moveFolderId: string;
  onMoveFolderIdChange: (value: string) => void;
  onMoveSite: () => void;
};

export function FolderDialogs({
  folders,
  sortedFolders,
  sortedSites,
  folderCreateOpen,
  onFolderCreateOpenChange,
  folderCreateName,
  onFolderCreateNameChange,
  folderCreateIcon,
  onFolderCreateIconChange,
  folderCreateColor,
  onFolderCreateColorChange,
  onCreateFolder,
  folderRenameOpen,
  onFolderRenameOpenChange,
  folderRenameId,
  onFolderRenameIdChange,
  folderRenameName,
  onFolderRenameNameChange,
  folderRenameIcon,
  onFolderRenameIconChange,
  folderRenameColor,
  onFolderRenameColorChange,
  onRenameFolder,
  folderDeleteOpen,
  onFolderDeleteOpenChange,
  folderDeleteId,
  onFolderDeleteIdChange,
  onDeleteFolder,
  moveOpen,
  onMoveOpenChange,
  moveSiteIds,
  onMoveSiteIdsChange,
  onToggleMoveSiteId,
  moveFolderId,
  onMoveFolderIdChange,
  onMoveSite,
}: FolderDialogsProps) {
  const t = useTranslations("folderDialogs");
  return (
    <>
      <AlertDialog
        open={folderCreateOpen}
        onOpenChange={onFolderCreateOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <FolderPlus className="size-4 text-muted-foreground" />
                {t("newFolder")}
              </AlertDialogTitle>
            <AlertDialogDescription>
              {t("createDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label htmlFor="folder-create-name" className="flex items-center gap-1.5">
              <FolderPlus className="size-3.5 text-muted-foreground" />
              {t("folderName")}
            </Label>
            <Input
              id="folder-create-name"
              value={folderCreateName}
              onChange={(event) =>
                onFolderCreateNameChange(event.target.value)
              }
              placeholder={t("folderNamePlaceholder")}
            />
          </div>
          <FolderVisualFields
            icon={folderCreateIcon}
            color={folderCreateColor}
            onIconChange={onFolderCreateIconChange}
            onColorChange={onFolderCreateColorChange}
          />
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onCreateFolder}>
              {t("create")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={folderRenameOpen}
        onOpenChange={onFolderRenameOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <PencilSimple className="size-4 text-muted-foreground" />
                {t("renameFolder")}
              </AlertDialogTitle>
            <AlertDialogDescription>
              {t("renameDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <FolderOpen className="size-3.5 text-muted-foreground" />
                {t("folder")}
              </Label>
              <Select
                value={folderRenameId ?? ""}
                onValueChange={(value) => {
                  onFolderRenameIdChange(value);
                  const nextFolder = folders.find(
                    (folder) => folder.id === value,
                  );
                  onFolderRenameNameChange(nextFolder?.name ?? "");
                  onFolderRenameIconChange(nextFolder?.icon ?? "folder");
                  onFolderRenameColorChange(nextFolder?.color ?? "#6b7280");
                }}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectFolder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t("folders")}</SelectLabel>
                    {sortedFolders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label htmlFor="folder-rename-name" className="flex items-center gap-1.5">
                <PencilSimple className="size-3.5 text-muted-foreground" />
                {t("folderName")}
              </Label>
              <Input
                id="folder-rename-name"
                value={folderRenameName}
                onChange={(event) =>
                  onFolderRenameNameChange(event.target.value)
                }
                placeholder={t("folderName")}
              />
            </div>
            <FolderVisualFields
              icon={folderRenameIcon}
              color={folderRenameColor}
              onIconChange={onFolderRenameIconChange}
              onColorChange={onFolderRenameColorChange}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onRenameFolder}>
              {t("save")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog
        open={folderDeleteOpen}
        onOpenChange={onFolderDeleteOpenChange}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <Trash className="size-4 text-muted-foreground" />
                {t("deleteFolder")}
              </AlertDialogTitle>
            <AlertDialogDescription>
              {t("deleteDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-2">
            <Label className="flex items-center gap-1.5">
              <FolderOpen className="size-3.5 text-muted-foreground" />
              {t("folder")}
            </Label>
            <Select
              value={folderDeleteId ?? ""}
              onValueChange={(value) => onFolderDeleteIdChange(value)}
            >
              <SelectTrigger className="w-full">
                <SelectValue placeholder={t("selectFolder")} />
              </SelectTrigger>
              <SelectContent>
                <SelectGroup>
                  <SelectLabel>{t("folders")}</SelectLabel>
                  {sortedFolders.map((folder) => (
                    <SelectItem key={folder.id} value={folder.id}>
                      {folder.name}
                    </SelectItem>
                  ))}
                </SelectGroup>
              </SelectContent>
            </Select>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onDeleteFolder}>
              {t("delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={moveOpen} onOpenChange={onMoveOpenChange}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
                <ArrowsLeftRight className="size-4 text-muted-foreground" />
                {t("moveSites")}
              </AlertDialogTitle>
            <AlertDialogDescription>
              {t("moveDescription")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-3">
            <div className="grid gap-2">
              <div className="flex items-center justify-between">
                <Label className="flex items-center gap-1.5">
                  <GlobeHemisphereWest className="size-3.5 text-muted-foreground" />
                  {t("sites")}
                </Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={() => {
                    if (moveSiteIds.length === sortedSites.length) {
                      onMoveSiteIdsChange([]);
                    } else {
                      onMoveSiteIdsChange(
                        sortedSites.map((site) => site.id),
                      );
                    }
                  }}
                >
                  {moveSiteIds.length === sortedSites.length
                    ? t("clearAll")
                    : t("selectAll")}
                </Button>
              </div>
              <div className="max-h-56 space-y-2 overflow-y-auto rounded-md border p-3">
                {sortedSites.map((site) => (
                  <label
                    key={site.id}
                    className="flex cursor-pointer items-center justify-between gap-3 rounded-sm px-1 py-1 hover:bg-muted"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-sm">
                        {displaySiteName(site.gsc_site_url)}
                      </div>
                      <div className="truncate text-xs text-muted-foreground">
                        {site.folder_name ?? t("unassigned")}
                      </div>
                    </div>
                    <Checkbox
                      checked={moveSiteIds.includes(site.id)}
                      onCheckedChange={(value) =>
                        onToggleMoveSiteId(site.id, Boolean(value))
                      }
                    />
                  </label>
                ))}
              </div>
            </div>
            <div className="grid gap-2">
              <Label className="flex items-center gap-1.5">
                <FolderOpen className="size-3.5 text-muted-foreground" />
                {t("destinationFolder")}
              </Label>
              <Select
                value={moveFolderId}
                onValueChange={(value) => onMoveFolderIdChange(value)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("selectFolder")} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectLabel>{t("folders")}</SelectLabel>
                    {sortedFolders.map((folder) => (
                      <SelectItem key={folder.id} value={folder.id}>
                        {folder.name}
                      </SelectItem>
                    ))}
                    <SelectItem value="unassigned">{t("unassigned")}</SelectItem>
                  </SelectGroup>
                </SelectContent>
              </Select>
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={onMoveSite}>{t("move")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
