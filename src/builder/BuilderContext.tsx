import React, { createContext, useContext, useState, useEffect, useCallback, useMemo, useRef } from 'react';
import {
  Breakpoint,
  BuilderBlock,
  BuilderPage,
  BuilderRevision,
  BuilderSection,
  BuilderTemplate,
  GlobalDesignSystem,
  PluginBuilderWidgetDef,
  ReusableSection,
  WidgetType,
  PageType,
} from '../types/builderTypes';
import {
  DEFAULT_GLOBAL_DESIGN,
  INITIAL_BUILDER_PAGES,
  DEFAULT_REUSABLE_SECTIONS,
  PREBUILT_TEMPLATES,
} from './defaultBuilderData';
import { pluginWidgetRegistry, initializeCorePluginWidgets } from './pluginWidgetRegistry';
import { usePluginSystem } from '../plugins/PluginContext';
import {
  fetchPublishedSiteData,
  fetchAdminSiteData,
  savePageDraftApi,
  publishPageApi,
  unpublishPageApi,
  restorePageRevisionApi,
  createPageApi,
  updatePageApi,
  deletePageApi,
  saveGlobalDesignApi,
  saveReusableSectionsApi,
  getAdminToken,
} from '../services/cmsApi';

interface BuilderContextType {
  pages: BuilderPage[];
  activePageId: string;
  activePage: BuilderPage;
  setActivePageId: (id: string) => void;
  breakpoint: Breakpoint;
  setBreakpoint: (bp: Breakpoint) => void;
  selectedSectionId: string | null;
  setSelectedSectionId: (id: string | null) => void;
  selectedBlockId: string | null;
  setSelectedBlockId: (id: string | null) => void;
  selectedBlock: BuilderBlock | null;
  selectedSection: BuilderSection | null;

  // Global Design System
  globalDesign: GlobalDesignSystem;
  updateGlobalDesign: (updated: Partial<GlobalDesignSystem>) => Promise<void>;
  resetGlobalDesign: () => void;

  // Reusable Sections & Templates
  reusableSections: ReusableSection[];
  saveReusableSection: (section: BuilderSection, title: string, category: string) => Promise<void>;
  deleteReusableSection: (id: string) => Promise<void>;
  templates: BuilderTemplate[];
  applyTemplate: (template: BuilderTemplate) => void;

  // Revisions & Autosave
  revisions: BuilderRevision[];
  undo: () => void;
  redo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isDirty: boolean;
  lastSavedText: string;
  saveDraft: () => Promise<void>;
  publishPage: () => Promise<void>;
  togglePagePublished: (pageId: string) => Promise<void>;
  toggleUseBuilderLayout: (pageId: string) => Promise<void>;
  revertToRevision: (revisionId: string) => Promise<void>;
  refreshBuilderData: () => Promise<void>;

  // Page Management
  createNewPage: (title: string, slug: string, type: PageType, templateId?: string) => Promise<string>;
  duplicatePage: (pageId: string) => Promise<string>;
  deletePage: (pageId: string) => Promise<void>;
  updatePageMeta: (pageId: string, meta: Partial<BuilderPage>) => Promise<void>;

  // Section Management
  addSection: (sectionData?: Partial<BuilderSection>, insertIndex?: number) => void;
  updateSection: (sectionId: string, updated: Partial<BuilderSection>) => void;
  deleteSection: (sectionId: string) => void;
  moveSection: (sectionId: string, direction: 'up' | 'down') => void;
  duplicateSection: (sectionId: string) => void;

  // Block Management
  addBlock: (sectionId: string, widgetType: WidgetType, pluginWidgetId?: string, insertIndex?: number) => void;
  updateBlock: (blockId: string, updated: Partial<BuilderBlock>) => void;
  deleteBlock: (blockId: string) => void;
  moveBlock: (blockId: string, direction: 'up' | 'down') => void;
  duplicateBlock: (blockId: string) => void;

  // Registered Plugin Widgets
  pluginWidgets: PluginBuilderWidgetDef[];

  // Full Screen Preview
  previewMode: boolean;
  setPreviewMode: (on: boolean) => void;
}

const BuilderContext = createContext<BuilderContextType | undefined>(undefined);

export const BuilderProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { activePlugins, isPluginActive } = usePluginSystem();

  // Initialize Core Plugin Widgets once
  useEffect(() => {
    initializeCorePluginWidgets();
  }, []);

  // Primary State
  const [pages, setPages] = useState<BuilderPage[]>(INITIAL_BUILDER_PAGES);
  const [activePageId, setActivePageId] = useState<string>('page-landing');
  const [breakpoint, setBreakpoint] = useState<Breakpoint>('desktop');
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
  const [previewMode, setPreviewMode] = useState<boolean>(false);

  const [globalDesign, setGlobalDesign] = useState<GlobalDesignSystem>(DEFAULT_GLOBAL_DESIGN);
  const [reusableSections, setReusableSections] = useState<ReusableSection[]>(DEFAULT_REUSABLE_SECTIONS);
  const [revisions, setRevisions] = useState<BuilderRevision[]>([]);

  const [isDirty, setIsDirty] = useState<boolean>(false);
  const [lastSaved, setLastSaved] = useState<Date>(new Date());

  // Undo / Redo History Stacks
  const [historyStack, setHistoryStack] = useState<BuilderSection[][]>([]);
  const [historyPointer, setHistoryPointer] = useState<number>(-1);

  // -------------------------------------------------------------
  // FETCH BUILDER DATA FROM PRODUCTION SERVER DATABASE
  // -------------------------------------------------------------

  const loadBuilderData = useCallback(async () => {
    const token = getAdminToken();
    try {
      if (token) {
        const adminData = await fetchAdminSiteData();
        if (adminData.pages && adminData.pages.length > 0) {
          setPages(adminData.pages);
        }
        if (adminData.globalDesign) {
          setGlobalDesign(adminData.globalDesign);
        }
        if (adminData.reusableSections) {
          setReusableSections(adminData.reusableSections);
        }
        if (adminData.revisions) {
          setRevisions(adminData.revisions);
        }
        return;
      }

      // Public visitor
      const pubData = await fetchPublishedSiteData();
      if (pubData.pages && pubData.pages.length > 0) {
        setPages(pubData.pages);
      }
      if (pubData.globalDesign) {
        setGlobalDesign(pubData.globalDesign);
      }
      if (pubData.reusableSections) {
        setReusableSections(pubData.reusableSections);
      }
    } catch (err) {
      console.warn('[BuilderContext] Could not load builder data from server:', err);
    }
  }, []);

  useEffect(() => {
    loadBuilderData();
  }, [loadBuilderData]);

  // Listen for synchronization updates from other tabs/contexts
  useEffect(() => {
    const handleSync = () => {
      loadBuilderData();
    };
    window.addEventListener('cms:published-updated', handleSync);
    return () => window.removeEventListener('cms:published-updated', handleSync);
  }, [loadBuilderData]);

  // Active page resolution
  const activePage = useMemo(() => {
    return pages.find((p) => p.id === activePageId) || pages[0] || INITIAL_BUILDER_PAGES[0];
  }, [pages, activePageId]);

  // Active section & block resolution
  const selectedSection = useMemo(() => {
    if (!selectedSectionId || !activePage) return null;
    return activePage.sections.find((s) => s.id === selectedSectionId) || null;
  }, [activePage, selectedSectionId]);

  const selectedBlock = useMemo(() => {
    if (!selectedBlockId || !activePage) return null;
    for (const s of activePage.sections) {
      const b = s.blocks.find((blk) => blk.id === selectedBlockId);
      if (b) return b;
    }
    return null;
  }, [activePage, selectedBlockId]);

  // History pushing
  const pushHistory = useCallback(
    (newSections: BuilderSection[]) => {
      const cloned = JSON.parse(JSON.stringify(newSections));
      const newHistory = historyStack.slice(0, historyPointer + 1);
      newHistory.push(cloned);
      if (newHistory.length > 30) newHistory.shift();
      setHistoryStack(newHistory);
      setHistoryPointer(newHistory.length - 1);
      setIsDirty(true);
    },
    [historyStack, historyPointer]
  );

  // Initialize history with initial active page sections
  useEffect(() => {
    if (activePage && historyStack.length === 0) {
      const initialCloned = JSON.parse(JSON.stringify(activePage.sections));
      setHistoryStack([initialCloned]);
      setHistoryPointer(0);
    }
  }, [activePageId]);

  // Helper to update sections of active page in memory
  const updateActivePageSections = useCallback(
    (newSections: BuilderSection[], recordHistory: boolean = true) => {
      setPages((prevPages) =>
        prevPages.map((page) => {
          if (page.id === activePageId) {
            return {
              ...page,
              sections: newSections,
              lastModified: new Date().toISOString(),
            };
          }
          return page;
        })
      );
      if (recordHistory) {
        pushHistory(newSections);
      }
    },
    [activePageId, pushHistory]
  );

  // Undo / Redo
  const canUndo = historyPointer > 0;
  const canRedo = historyPointer < historyStack.length - 1;

  const undo = useCallback(() => {
    if (canUndo) {
      const newPointer = historyPointer - 1;
      const targetSections = historyStack[newPointer];
      if (targetSections) {
        setHistoryPointer(newPointer);
        updateActivePageSections(JSON.parse(JSON.stringify(targetSections)), false);
        setIsDirty(true);
      }
    }
  }, [canUndo, historyPointer, historyStack, updateActivePageSections]);

  const redo = useCallback(() => {
    if (canRedo) {
      const newPointer = historyPointer + 1;
      const targetSections = historyStack[newPointer];
      if (targetSections) {
        setHistoryPointer(newPointer);
        updateActivePageSections(JSON.parse(JSON.stringify(targetSections)), false);
        setIsDirty(true);
      }
    }
  }, [canRedo, historyPointer, historyStack, updateActivePageSections]);

  // -------------------------------------------------------------
  // PERSISTENCE & PUBLISHING CMS WORKFLOW
  // -------------------------------------------------------------

  /**
   * Save Draft: Persists changes to the shared production database as an unpublished working draft.
   * Public website will NOT see these changes until published.
   */
  const saveDraft = useCallback(async () => {
    if (!activePage) return;

    try {
      const res = await savePageDraftApi(activePageId, activePage.sections, 'Admin FujiFinder');
      const now = new Date();
      setLastSaved(now);
      setIsDirty(false);

      // Update page in local state with the returned authoritative record
      setPages((prev) => prev.map((p) => (p.id === activePageId ? res.page : p)));

      // Record revision
      const newRev: BuilderRevision = {
        id: `rev-${Date.now()}`,
        pageId: activePageId,
        timestamp: now.toISOString(),
        author: 'Admin FujiFinder',
        description: `Draft Saved (${activePage.sections.length} sections, ${activePage.sections.reduce((acc, s) => acc + s.blocks.length, 0)} blocks)`,
        sections: JSON.parse(JSON.stringify(activePage.sections)),
      };
      setRevisions((prev) => [newRev, ...prev.slice(0, 49)]);
    } catch (err: any) {
      console.error('[BuilderContext] Failed to save draft on server:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  }, [activePageId, activePage]);

  /**
   * Publish: Persists changes to the shared production database as the new published version.
   * Updates published_version and updates the public website data source immediately.
   */
  const publishPage = useCallback(async () => {
    if (!activePage) return;

    try {
      const res = await publishPageApi(activePageId, activePage, 'Admin FujiFinder');
      const now = new Date();
      setLastSaved(now);
      setIsDirty(false);

      // Update local state with the newly published page record
      setPages((prev) => prev.map((p) => (p.id === activePageId ? res.page : p)));

      // Record published revision
      const newRev: BuilderRevision = {
        id: `rev-pub-${Date.now()}`,
        pageId: activePageId,
        timestamp: now.toISOString(),
        author: 'Admin FujiFinder',
        description: `Published Version (${activePage.title})`,
        sections: JSON.parse(JSON.stringify(activePage.sections)),
      };
      setRevisions((prev) => [newRev, ...prev.slice(0, 49)]);

      // Broadcast event so all views and external listeners update their public copy
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
    } catch (err: any) {
      console.error('[BuilderContext] Failed to publish page on server:', err);
      throw new Error('Changes could not be saved. Please try again.');
    }
  }, [activePageId, activePage]);

  const togglePagePublished = useCallback(
    async (pageId: string) => {
      const targetPage = pages.find((p) => p.id === pageId);
      if (!targetPage) return;

      try {
        if (targetPage.status === 'published') {
          const res = await unpublishPageApi(pageId);
          setPages((prev) => prev.map((p) => (p.id === pageId ? res.page : p)));
        } else {
          const res = await publishPageApi(pageId, targetPage);
          setPages((prev) => prev.map((p) => (p.id === pageId ? res.page : p)));
        }
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
      } catch (err) {
        console.error('Failed to toggle published status on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [pages]
  );

  const toggleUseBuilderLayout = useCallback(
    async (pageId: string) => {
      const targetPage = pages.find((p) => p.id === pageId);
      if (!targetPage) return;

      const nextVal = !targetPage.useBuilderLayout;
      try {
        const res = await updatePageApi(pageId, { useBuilderLayout: nextVal });
        setPages((prev) => prev.map((p) => (p.id === pageId ? res.page : p)));
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
      } catch (err) {
        console.error('Failed to update page layout setting on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [pages]
  );

  const revertToRevision = useCallback(
    async (revisionId: string) => {
      try {
        const res = await restorePageRevisionApi(activePageId, revisionId);
        setPages((prev) => prev.map((p) => (p.id === activePageId ? res.page : p)));
        setIsDirty(false);
        setLastSaved(new Date());
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
      } catch (err) {
        console.error('Failed to restore page revision on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [activePageId]
  );

  // Autosave periodically every 30s when dirty
  useEffect(() => {
    if (!isDirty) return;
    const timer = setTimeout(() => {
      saveDraft().catch((err) => console.warn('Autosave skipped:', err));
    }, 30000);
    return () => clearTimeout(timer);
  }, [isDirty, saveDraft]);

  const lastSavedText = useMemo(() => {
    const diffSeconds = Math.floor((new Date().getTime() - lastSaved.getTime()) / 1000);
    if (diffSeconds < 5) return 'Baru saja disimpan';
    if (diffSeconds < 60) return `${diffSeconds} detik lalu`;
    const mins = Math.floor(diffSeconds / 60);
    return `${mins} menit lalu`;
  }, [lastSaved, isDirty]);

  // -------------------------------------------------------------
  // PAGE MANAGEMENT (PERSISTED TO PRODUCTION SERVER)
  // -------------------------------------------------------------

  const createNewPage = useCallback(
    async (title: string, slug: string, type: PageType, templateId?: string): Promise<string> => {
      const newId = `page-${Date.now()}`;
      let initialSections: BuilderSection[] = [];

      if (templateId) {
        const tpl = PREBUILT_TEMPLATES.find((t) => t.id === templateId);
        if (tpl) {
          initialSections = JSON.parse(JSON.stringify(tpl.sections));
        }
      }

      if (initialSections.length === 0) {
        initialSections = [
          {
            id: `sec-${Date.now()}`,
            name: 'Section Baru',
            visibility: { desktop: true, tablet: true, mobile: true },
            style: {
              backgroundColor: '#FFFFFF',
              paddingY: { desktop: 48, tablet: 36, mobile: 24 },
            },
            blocks: [],
          },
        ];
      }

      const newPage: BuilderPage = {
        id: newId,
        title,
        slug: slug.replace(/^\/+/, ''),
        type,
        status: 'draft',
        lastModified: new Date().toISOString(),
        author: 'Admin FujiFinder',
        sections: initialSections,
        useBuilderLayout: true,
      };

      try {
        const res = await createPageApi(newPage);
        setPages((prev) => [res.page, ...prev]);
        setActivePageId(res.page.id);
        return res.page.id;
      } catch (err) {
        console.error('Failed to create page on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    []
  );

  const duplicatePage = useCallback(
    async (pageId: string): Promise<string> => {
      const original = pages.find((p) => p.id === pageId);
      if (!original) return '';

      const newId = `page-${Date.now()}`;
      const duplicated: BuilderPage = {
        ...JSON.parse(JSON.stringify(original)),
        id: newId,
        title: `${original.title} (Salinan)`,
        slug: `${original.slug}-copy-${Date.now().toString().slice(-4)}`,
        status: 'draft',
        lastModified: new Date().toISOString(),
        publishedAt: undefined,
        isDefaultCorePage: false,
      };

      try {
        const res = await createPageApi(duplicated);
        setPages((prev) => [res.page, ...prev]);
        setActivePageId(res.page.id);
        return res.page.id;
      } catch (err) {
        console.error('Failed to duplicate page on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [pages]
  );

  const deletePage = useCallback(
    async (pageId: string) => {
      try {
        await deletePageApi(pageId);
        setPages((prev) => {
          const filtered = prev.filter((p) => p.id !== pageId);
          if (activePageId === pageId && filtered.length > 0) {
            setActivePageId(filtered[0].id);
          }
          return filtered;
        });
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
      } catch (err) {
        console.error('Failed to delete page on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [activePageId]
  );

  const updatePageMeta = useCallback(
    async (pageId: string, meta: Partial<BuilderPage>) => {
      try {
        const res = await updatePageApi(pageId, meta);
        setPages((prev) => prev.map((p) => (p.id === pageId ? res.page : p)));
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
      } catch (err) {
        console.error('Failed to update page meta on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    []
  );

  const applyTemplate = useCallback(
    (template: BuilderTemplate) => {
      const clonedSections = JSON.parse(JSON.stringify(template.sections));
      const refreshedSections = clonedSections.map((sec: BuilderSection) => ({
        ...sec,
        id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        blocks: sec.blocks.map((blk: BuilderBlock) => ({
          ...blk,
          id: `blk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        })),
      }));

      updateActivePageSections(refreshedSections, true);
      if (refreshedSections.length > 0) {
        setSelectedSectionId(refreshedSections[0].id);
      }
    },
    [updateActivePageSections]
  );

  // -------------------------------------------------------------
  // REUSABLE SECTIONS & GLOBAL DESIGN (PERSISTED TO SERVER)
  // -------------------------------------------------------------

  const saveReusableSection = useCallback(
    async (section: BuilderSection, title: string, category: string) => {
      const newReusable: ReusableSection = {
        id: `reusable-${Date.now()}`,
        title,
        category: category || 'Custom',
        createdAt: new Date().toISOString(),
        section: JSON.parse(JSON.stringify(section)),
      };

      const updated = [newReusable, ...reusableSections];
      try {
        await saveReusableSectionsApi(updated);
        setReusableSections(updated);
      } catch (err) {
        console.error('Failed to save reusable section on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [reusableSections]
  );

  const deleteReusableSection = useCallback(
    async (id: string) => {
      const updated = reusableSections.filter((r) => r.id !== id);
      try {
        await saveReusableSectionsApi(updated);
        setReusableSections(updated);
      } catch (err) {
        console.error('Failed to delete reusable section on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [reusableSections]
  );

  const updateGlobalDesign = useCallback(
    async (updated: Partial<GlobalDesignSystem>) => {
      const nextDesign: GlobalDesignSystem = {
        ...globalDesign,
        ...updated,
        colors: { ...globalDesign.colors, ...(updated.colors || {}) },
        typography: { ...globalDesign.typography, ...(updated.typography || {}) },
        buttons: { ...globalDesign.buttons, ...(updated.buttons || {}) },
        cards: { ...globalDesign.cards, ...(updated.cards || {}) },
        header: { ...globalDesign.header, ...(updated.header || {}) },
        footer: { ...globalDesign.footer, ...(updated.footer || {}) },
      };

      try {
        await saveGlobalDesignApi(nextDesign);
        setGlobalDesign(nextDesign);
        window.dispatchEvent(new CustomEvent('cms:published-updated'));
      } catch (err) {
        console.error('Failed to save global design on server:', err);
        throw new Error('Changes could not be saved. Please try again.');
      }
    },
    [globalDesign]
  );

  const resetGlobalDesign = useCallback(async () => {
    try {
      await saveGlobalDesignApi(DEFAULT_GLOBAL_DESIGN);
      setGlobalDesign(DEFAULT_GLOBAL_DESIGN);
      window.dispatchEvent(new CustomEvent('cms:published-updated'));
    } catch (err) {
      console.error('Failed to reset global design on server:', err);
    }
  }, []);

  // -------------------------------------------------------------
  // SECTION CRUD (IN-MEMORY FOR ACTIVE PAGE)
  // -------------------------------------------------------------

  const addSection = useCallback(
    (sectionData?: Partial<BuilderSection>, insertIndex?: number) => {
      const newSection: BuilderSection = {
        id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: sectionData?.name || `Section Baru #${(activePage?.sections.length || 0) + 1}`,
        visibility: { desktop: true, tablet: true, mobile: true },
        style: {
          backgroundColor: '#FFFFFF',
          paddingY: { desktop: 48, tablet: 36, mobile: 24 },
          ...sectionData?.style,
        },
        blocks: sectionData?.blocks ? JSON.parse(JSON.stringify(sectionData.blocks)) : [],
        ...sectionData,
      };

      const currentSections = [...(activePage?.sections || [])];
      if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= currentSections.length) {
        currentSections.splice(insertIndex, 0, newSection);
      } else {
        currentSections.push(newSection);
      }

      updateActivePageSections(currentSections, true);
      setSelectedSectionId(newSection.id);
    },
    [activePage, updateActivePageSections]
  );

  const updateSection = useCallback(
    (sectionId: string, updated: Partial<BuilderSection>) => {
      const updatedSections = (activePage?.sections || []).map((sec) => {
        if (sec.id === sectionId) {
          return {
            ...sec,
            ...updated,
            style: { ...sec.style, ...(updated.style || {}) },
            visibility: { ...sec.visibility, ...(updated.visibility || {}) },
          };
        }
        return sec;
      });
      updateActivePageSections(updatedSections, true);
    },
    [activePage, updateActivePageSections]
  );

  const deleteSection = useCallback(
    (sectionId: string) => {
      const updatedSections = (activePage?.sections || []).filter((sec) => sec.id !== sectionId);
      updateActivePageSections(updatedSections, true);
      if (selectedSectionId === sectionId) {
        setSelectedSectionId(null);
        setSelectedBlockId(null);
      }
    },
    [activePage, selectedSectionId, updateActivePageSections]
  );

  const moveSection = useCallback(
    (sectionId: string, direction: 'up' | 'down') => {
      const sections = [...(activePage?.sections || [])];
      const index = sections.findIndex((s) => s.id === sectionId);
      if (index === -1) return;

      if (direction === 'up' && index > 0) {
        const temp = sections[index];
        sections[index] = sections[index - 1];
        sections[index - 1] = temp;
        updateActivePageSections(sections, true);
      } else if (direction === 'down' && index < sections.length - 1) {
        const temp = sections[index];
        sections[index] = sections[index + 1];
        sections[index + 1] = temp;
        updateActivePageSections(sections, true);
      }
    },
    [activePage, updateActivePageSections]
  );

  const duplicateSection = useCallback(
    (sectionId: string) => {
      const sections = [...(activePage?.sections || [])];
      const index = sections.findIndex((s) => s.id === sectionId);
      if (index === -1) return;

      const source = sections[index];
      const cloned: BuilderSection = {
        ...JSON.parse(JSON.stringify(source)),
        id: `sec-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        name: `${source.name} (Salinan)`,
        blocks: source.blocks.map((blk: BuilderBlock) => ({
          ...blk,
          id: `blk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        })),
      };

      sections.splice(index + 1, 0, cloned);
      updateActivePageSections(sections, true);
      setSelectedSectionId(cloned.id);
    },
    [activePage, updateActivePageSections]
  );

  // -------------------------------------------------------------
  // BLOCK CRUD (IN-MEMORY FOR ACTIVE PAGE)
  // -------------------------------------------------------------

  const addBlock = useCallback(
    (sectionId: string, widgetType: WidgetType, pluginWidgetId?: string, insertIndex?: number) => {
      let defaultContent: Record<string, any> = {};
      let defaultStyle: Record<string, any> = {};
      let blockLabel = 'Widget';

      if (widgetType === 'plugin-widget' && pluginWidgetId) {
        const pw = pluginWidgetRegistry.get(pluginWidgetId);
        if (pw) {
          blockLabel = pw.name;
          defaultContent = JSON.parse(JSON.stringify(pw.defaultContent));
          defaultStyle = JSON.parse(JSON.stringify(pw.defaultStyle || {}));
        }
      } else {
        switch (widgetType) {
          case 'hero':
            blockLabel = 'Hero Banner Showcase';
            defaultContent = {
              headline: 'Judul Utama Hero Fujifilm',
              subtitle: 'Subjudul atau pengantar ulasan teknis dengan detail pengujian sensor.',
              badge: 'Ulasan Eksklusif',
              primaryBtnText: 'Pelajari Selengkapnya',
              primaryBtnLink: '#',
              backgroundImage:
                'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
              overlayOpacity: 0.6,
              alignment: 'left',
              minHeight: 480,
            };
            break;
          case 'article-grid':
            blockLabel = 'Grid Artikel Editorial';
            defaultContent = {
              category: 'all',
              count: 6,
              columns: 3,
              showExcerpt: true,
              showBadge: true,
              showAuthor: true,
              showReadTime: true,
              sortBy: 'date',
            };
            break;
          case 'article-list':
            blockLabel = 'Daftar Artikel Ringkas';
            defaultContent = {
              category: 'all',
              count: 5,
              showThumbnails: true,
            };
            break;
          case 'featured-articles':
            blockLabel = 'Artikel Pilihan Editor';
            defaultContent = {
              headline: 'Liputan Paling Banyak Dibaca',
              count: 3,
            };
            break;
          case 'product-cards':
            blockLabel = 'Katalog Kamera Teruji';
            defaultContent = {
              count: 6,
              columns: 3,
              showScores: true,
              showAffiliateBtn: true,
              showCompareBtn: true,
              filterCategory: 'all',
            };
            break;
          case 'product-recommendation':
            blockLabel = 'Rekomendasi Kamera Lab';
            defaultContent = {
              title: 'Kamera Terbaik Rekomendasi Editor',
              showRatings: true,
              showProsCons: true,
              showDirectAffiliateBtn: true,
            };
            break;
          case 'camera-comparison':
            blockLabel = 'Tabel Komparasi Kamera';
            defaultContent = {
              title: 'Perbandingan Head-to-Head Kamera',
              subtitle: 'Pilih kamera Fujifilm untuk menguji kecocokan spesifikasi Anda.',
            };
            break;
          case 'affiliate-product-cta':
            blockLabel = 'Banner Penawaran Affiliate';
            defaultContent = {
              title: 'Dapatkan Harga Resmi Terbaik Hari Ini',
              description: 'Garansi resmi distributor dan penawaran bundling lensa terbaik.',
              btnText: 'Lihat Promo Retailer',
              btnLink: '#cameras',
              badge: 'Penawaran Terverifikasi',
            };
            break;
          case 'category-cards':
            blockLabel = 'Kartu Kategori Kamera';
            defaultContent = {
              title: 'Eksplorasi Format Kamera',
              columns: 4,
            };
            break;
          case 'newsletter-signup':
            blockLabel = 'Formulir Langganan Newsletter';
            defaultContent = {
              title: 'Langganan Jurnal Mingguan FujiFinder',
              subtitle: 'Resep simulasi film eksklusif dan ulasan firmware terkini.',
              btnText: 'Langganan Sekarang',
            };
            break;
          case 'search-bar':
            blockLabel = 'Bilah Pencarian Cepat';
            defaultContent = {
              placeholder: 'Cari kamera, lensa, atau panduan...',
              showQuickTags: true,
              quickTags: ['X-T5', 'X100VI', 'X-S20', 'Film Simulation'],
            };
            break;
          case 'text':
            blockLabel = 'Blok Teks / Judul';
            defaultContent = {
              tag: 'h2',
              eyebrow: 'Kategori Liputan',
              title: 'Judul Bagian Yang Menarik',
              description: 'Paragraf penjelasan detail tentang isi bagian ini.',
              align: 'left',
            };
            break;
          case 'rich-text':
            blockLabel = 'Konten Rich Text';
            defaultContent = {
              body: '<p>Tuliskan panduan mendalam atau catatan teknis di sini. Mendukung pemformatan teks, tautan, dan kutipan editorial.</p>',
            };
            break;
          case 'image':
            blockLabel = 'Gambar Responsif';
            defaultContent = {
              url: 'https://images.unsplash.com/photo-1516035069371-29a1b244cc32?auto=format&fit=crop&w=1200&q=80',
              caption: 'Fujifilm X-T5 dengan lensa XF 33mm f/1.4 R LM WR.',
              aspectRatio: '16:9',
            };
            break;
          case 'video':
            blockLabel = 'Embed Video Uji Lapangan';
            defaultContent = {
              embedUrl: 'https://www.youtube.com/embed/dQw4w9WgXcQ',
              title: 'Uji Autofokus AI & Video 6.2K',
            };
            break;
          case 'button':
            blockLabel = 'Tombol Tindakan (CTA)';
            defaultContent = {
              text: 'Jelajahi Kamera Fujifilm',
              link: '#cameras',
              variant: 'primary',
              alignment: 'center',
            };
            break;
          case 'divider':
            blockLabel = 'Garis Pemisah (Divider)';
            defaultContent = {
              style: 'solid',
              width: '100%',
            };
            break;
          case 'spacer':
            blockLabel = 'Ruang Kosong (Spacer)';
            defaultContent = {
              height: 48,
            };
            break;
          case 'social-links':
            blockLabel = 'Tautan Media Sosial';
            defaultContent = {
              instagram: 'https://instagram.com/fujifinder',
              youtube: 'https://youtube.com',
              twitter: 'https://twitter.com',
            };
            break;
          case 'author-profile':
            blockLabel = 'Profil Penulis & Reviewer';
            defaultContent = {
              name: 'Raden P. & Tim Lab FujiFinder',
              role: 'Lead Gear Tester & Fotografer Komersial',
              bio: 'Menguji kamera digital sejak 2012 dengan lebih dari 80 ulasan bodi dan lensa X-Mount.',
              avatar:
                'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=300&q=80',
            };
            break;
          case 'advertisement-block':
            blockLabel = 'Slot Banner Sponsor / Iklan';
            defaultContent = {
              title: 'Slot Iklan Terverifikasi',
              badge: 'Sponsor Resmi',
              link: '#',
              imageUrl:
                'https://images.unsplash.com/photo-1526170375885-4d8ecf77b99f?auto=format&fit=crop&w=800&q=80',
            };
            break;
          case 'custom-html':
            blockLabel = 'Kustom HTML / Script Embed';
            defaultContent = {
              htmlCode:
                '<div class="p-4 bg-neutral-100 text-center font-mono text-xs border border-dashed border-neutral-300">Custom HTML Container</div>',
            };
            break;
          default:
            blockLabel = widgetType;
        }
      }

      const newBlock: BuilderBlock = {
        id: `blk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
        type: widgetType,
        label: blockLabel,
        pluginWidgetId,
        content: defaultContent,
        style: {
          maxWidth: '1280px',
          ...defaultStyle,
        },
        visibility: { desktop: true, tablet: true, mobile: true },
      };

      const updatedSections = (activePage?.sections || []).map((sec) => {
        if (sec.id === sectionId) {
          const blocks = [...sec.blocks];
          if (insertIndex !== undefined && insertIndex >= 0 && insertIndex <= blocks.length) {
            blocks.splice(insertIndex, 0, newBlock);
          } else {
            blocks.push(newBlock);
          }
          return { ...sec, blocks };
        }
        return sec;
      });

      updateActivePageSections(updatedSections, true);
      setSelectedBlockId(newBlock.id);
    },
    [activePage, updateActivePageSections]
  );

  const updateBlock = useCallback(
    (blockId: string, updated: Partial<BuilderBlock>) => {
      const updatedSections = (activePage?.sections || []).map((sec) => {
        const blockIndex = sec.blocks.findIndex((b) => b.id === blockId);
        if (blockIndex !== -1) {
          const currentBlock = sec.blocks[blockIndex];
          const newBlock = {
            ...currentBlock,
            ...updated,
            content: { ...currentBlock.content, ...(updated.content || {}) },
            style: { ...currentBlock.style, ...(updated.style || {}) },
            visibility: { ...currentBlock.visibility, ...(updated.visibility || {}) },
          };
          const newBlocks = [...sec.blocks];
          newBlocks[blockIndex] = newBlock;
          return { ...sec, blocks: newBlocks };
        }
        return sec;
      });

      updateActivePageSections(updatedSections, true);
    },
    [activePage, updateActivePageSections]
  );

  const deleteBlock = useCallback(
    (blockId: string) => {
      const updatedSections = (activePage?.sections || []).map((sec) => {
        return {
          ...sec,
          blocks: sec.blocks.filter((b) => b.id !== blockId),
        };
      });
      updateActivePageSections(updatedSections, true);
      if (selectedBlockId === blockId) {
        setSelectedBlockId(null);
      }
    },
    [activePage, selectedBlockId, updateActivePageSections]
  );

  const moveBlock = useCallback(
    (blockId: string, direction: 'up' | 'down') => {
      const updatedSections = (activePage?.sections || []).map((sec) => {
        const index = sec.blocks.findIndex((b) => b.id === blockId);
        if (index === -1) return sec;

        const blocks = [...sec.blocks];
        if (direction === 'up' && index > 0) {
          const temp = blocks[index];
          blocks[index] = blocks[index - 1];
          blocks[index - 1] = temp;
          return { ...sec, blocks };
        } else if (direction === 'down' && index < blocks.length - 1) {
          const temp = blocks[index];
          blocks[index] = blocks[index + 1];
          blocks[index + 1] = temp;
          return { ...sec, blocks };
        }
        return sec;
      });

      updateActivePageSections(updatedSections, true);
    },
    [activePage, updateActivePageSections]
  );

  const duplicateBlock = useCallback(
    (blockId: string) => {
      const updatedSections = (activePage?.sections || []).map((sec) => {
        const index = sec.blocks.findIndex((b) => b.id === blockId);
        if (index === -1) return sec;

        const source = sec.blocks[index];
        const cloned: BuilderBlock = {
          ...JSON.parse(JSON.stringify(source)),
          id: `blk-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
          label: `${source.label} (Salinan)`,
        };

        const blocks = [...sec.blocks];
        blocks.splice(index + 1, 0, cloned);
        return { ...sec, blocks };
      });

      updateActivePageSections(updatedSections, true);
    },
    [activePage, updateActivePageSections]
  );

  // Plugin widgets
  const pluginWidgets = useMemo(() => {
    return pluginWidgetRegistry.getAll().filter((def) => {
      if (!def.pluginId) return true;
      return isPluginActive(def.pluginId);
    });
  }, [activePlugins, isPluginActive]);

  return (
    <BuilderContext.Provider
      value={{
        pages,
        activePageId,
        activePage,
        setActivePageId,
        breakpoint,
        setBreakpoint,
        selectedSectionId,
        setSelectedSectionId,
        selectedBlockId,
        setSelectedBlockId,
        selectedBlock,
        selectedSection,
        globalDesign,
        updateGlobalDesign,
        resetGlobalDesign,
        reusableSections,
        saveReusableSection,
        deleteReusableSection,
        templates: PREBUILT_TEMPLATES,
        applyTemplate,
        revisions,
        undo,
        redo,
        canUndo,
        canRedo,
        isDirty,
        lastSavedText,
        saveDraft,
        publishPage,
        togglePagePublished,
        toggleUseBuilderLayout,
        revertToRevision,
        refreshBuilderData: loadBuilderData,
        createNewPage,
        duplicatePage,
        deletePage,
        updatePageMeta,
        addSection,
        updateSection,
        deleteSection,
        moveSection,
        duplicateSection,
        addBlock,
        updateBlock,
        deleteBlock,
        moveBlock,
        duplicateBlock,
        pluginWidgets,
        previewMode,
        setPreviewMode,
      }}
    >
      {children}
    </BuilderContext.Provider>
  );
};

export const useSiteBuilder = (): BuilderContextType => {
  const context = useContext(BuilderContext);
  if (!context) {
    throw new Error('useSiteBuilder must be used within a BuilderProvider');
  }
  return context;
};
