"use client";

import { useMemo, useState } from "react";

type Perspective = "Inbox" | "Projects" | "Tags" | "Forecast" | "Flagged" | "Review";

type Task = {
  id: number;
  title: string;
  project: string;
  tags: string[];
  due?: string;
  defer?: string;
  note?: string;
  flagged?: boolean;
  done?: boolean;
};

const projectData = [
  { name: "Welcome to OmniFocus", color: "#8f57c8", note: "A few ideas to help you get oriented." },
  { name: "Throw a party", color: "#2f8de4", note: "Everything needed for a relaxed Friday night." },
  { name: "Spring garden cleanup", color: "#58a65c", note: "Get the backyard ready for the season." },
];

const starterTasks: Task[] = [
  { id: 1, title: "Explore your new OmniFocus database", project: "Welcome to OmniFocus", tags: ["Tutorial"], note: "Select an action to see and edit all of its details in the Inspector." },
  { id: 2, title: "Add a few actions of your own", project: "Welcome to OmniFocus", tags: ["Tutorial"], note: "Use New Action in the toolbar, or Quick Entry from anywhere." },
  { id: 3, title: "Open Forecast and plan the week", project: "Welcome to OmniFocus", tags: ["Tutorial"], due: "Today", flagged: true },
  { id: 4, title: "Order a cake", project: "Throw a party", tags: ["Errands"], due: "Today, 5:00 PM", note: "Chocolate with vanilla frosting. Serves 12.", flagged: true },
  { id: 5, title: "Get ice cream", project: "Throw a party", tags: ["Errands"], due: "Tomorrow" },
  { id: 6, title: "Make a playlist", project: "Throw a party", tags: ["Mac"], defer: "Today, 7:00 PM" },
  { id: 7, title: "Text invitations to friends", project: "Throw a party", tags: ["Phone"], done: true },
  { id: 8, title: "Repair gate", project: "Spring garden cleanup", tags: ["Home"], due: "Aug 18" },
  { id: 9, title: "Test the sprinkler system", project: "Spring garden cleanup", tags: ["Home"], due: "Aug 20", flagged: true },
  { id: 10, title: "Pick up compost and mulch", project: "Spring garden cleanup", tags: ["Errands"], due: "Aug 21" },
  { id: 11, title: "Sketch new herb bed", project: "Spring garden cleanup", tags: ["Home", "Mac"] },
  { id: 12, title: "Book annual dentist appointment", project: "Inbox", tags: ["Phone"], due: "Aug 22" },
  { id: 13, title: "Send Maya the revised itinerary", project: "Inbox", tags: ["Mac"], flagged: true },
  { id: 14, title: "Replace kitchen light bulb", project: "Inbox", tags: ["Home"] },
];

const perspectiveItems: { name: Perspective; glyph: string; badge?: string }[] = [
  { name: "Inbox", glyph: "▾", badge: "3" },
  { name: "Projects", glyph: "▱" },
  { name: "Tags", glyph: "⌘" },
  { name: "Forecast", glyph: "15", badge: "2" },
  { name: "Flagged", glyph: "⚑" },
  { name: "Review", glyph: "✓" },
];

function TaskRow({ task, selected, onSelect, onComplete }: {
  task: Task;
  selected: boolean;
  onSelect: () => void;
  onComplete: () => void;
}) {
  return (
    <div
      className={`task-row ${selected ? "selected" : ""} ${task.done ? "completed" : ""}`}
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(event) => event.key === "Enter" && onSelect()}
    >
      <button
        className={`status-ring ${task.done ? "is-done" : ""}`}
        aria-label={task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`}
        onClick={(event) => { event.stopPropagation(); onComplete(); }}
      >
        {task.done ? "✓" : ""}
      </button>
      <div className="task-copy">
        <div className="task-title-line">
          <span className="task-title">{task.title}</span>
          {task.note && <span className="note-indicator">⌑</span>}
        </div>
        <div className="task-meta">
          {task.project !== "Inbox" && <span>{task.project}</span>}
          {task.tags.map((tag) => <span className="tag-chip" key={tag}>{tag}</span>)}
        </div>
      </div>
      <div className="row-tail">
        {task.due && <span className={task.due.startsWith("Today") ? "due today" : "due"}>{task.due}</span>}
        {task.flagged && <span className="flag-mark">⚑</span>}
      </div>
    </div>
  );
}

export default function Home() {
  const [perspective, setPerspective] = useState<Perspective>("Projects");
  const [tasks, setTasks] = useState<Task[]>(starterTasks);
  const [selectedId, setSelectedId] = useState(4);
  const [projectFilter, setProjectFilter] = useState<string | null>(null);
  const [sidebarVisible, setSidebarVisible] = useState(true);
  const [inspectorVisible, setInspectorVisible] = useState(true);
  const [quickEntry, setQuickEntry] = useState(false);
  const [quickTitle, setQuickTitle] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [viewMenu, setViewMenu] = useState(false);
  const [showCompleted, setShowCompleted] = useState(true);

  const selectedTask = tasks.find((task) => task.id === selectedId) ?? tasks[0];

  const visibleTasks = useMemo(() => {
    let result = tasks;
    if (perspective === "Inbox") result = result.filter((task) => task.project === "Inbox");
    if (perspective === "Flagged") result = result.filter((task) => task.flagged);
    if (perspective === "Forecast") result = result.filter((task) => task.due);
    if (perspective === "Projects") result = result.filter((task) => task.project !== "Inbox");
    if (projectFilter) result = result.filter((task) => task.project === projectFilter);
    if (!showCompleted) result = result.filter((task) => !task.done);
    if (query.trim()) result = result.filter((task) => task.title.toLowerCase().includes(query.toLowerCase()));
    return result;
  }, [tasks, perspective, projectFilter, showCompleted, query]);

  const title = projectFilter || perspective;

  const changePerspective = (next: Perspective) => {
    setPerspective(next);
    setProjectFilter(null);
    setViewMenu(false);
  };

  const toggleComplete = (id: number) => {
    setTasks((current) => current.map((task) => task.id === id ? { ...task, done: !task.done } : task));
  };

  const updateSelected = (patch: Partial<Task>) => {
    setTasks((current) => current.map((task) => task.id === selectedId ? { ...task, ...patch } : task));
  };

  const addAction = (titleText = "New action") => {
    const id = Math.max(...tasks.map((task) => task.id)) + 1;
    const project = projectFilter || (selectedTask?.project !== "Inbox" ? selectedTask.project : "Inbox");
    const task: Task = { id, title: titleText, project, tags: [] };
    setTasks((current) => [...current, task]);
    setSelectedId(id);
    if (project === "Inbox") changePerspective("Inbox");
  };

  const saveQuickEntry = () => {
    if (quickTitle.trim()) addAction(quickTitle.trim());
    setQuickTitle("");
    setQuickEntry(false);
  };

  const focusSelected = () => {
    if (!selectedTask || selectedTask.project === "Inbox") return;
    setPerspective("Projects");
    setProjectFilter(selectedTask.project);
  };

  const groupedByTag = useMemo(() => {
    const groups = new Map<string, Task[]>();
    visibleTasks.forEach((task) => {
      const key = task.tags[0] || "Untagged";
      groups.set(key, [...(groups.get(key) || []), task]);
    });
    return [...groups.entries()];
  }, [visibleTasks]);

  const renderTask = (task: Task) => (
    <TaskRow
      key={task.id}
      task={task}
      selected={task.id === selectedId}
      onSelect={() => setSelectedId(task.id)}
      onComplete={() => toggleComplete(task.id)}
    />
  );

  return (
    <main className="desktop">
      <section className={`app-window ${!sidebarVisible ? "sidebar-collapsed" : ""} ${!inspectorVisible ? "inspector-collapsed" : ""}`} aria-label="OmniFocus task manager">
        <header className="toolbar">
          <div className="traffic-lights" aria-hidden="true"><i /><i /><i /></div>
          <div className="toolbar-section leading-tools">
            <button className={`tool ${sidebarVisible ? "active" : ""}`} onClick={() => setSidebarVisible(!sidebarVisible)} aria-label="Toggle sidebar">
              <span className="tool-glyph sidebar-glyph"><b /></span><small>Sidebar</small>
            </button>
            <div className="history-buttons" aria-label="Navigation history">
              <button disabled aria-label="Back">‹</button><button disabled aria-label="Forward">›</button>
            </div>
            <div className="view-wrap">
              <button className={`tool ${viewMenu ? "active" : ""}`} onClick={() => setViewMenu(!viewMenu)} aria-label="View options">
                <span className="tool-glyph view-glyph">☷</span><small>View</small>
              </button>
              {viewMenu && (
                <div className="view-popover">
                  <strong>View Options</strong>
                  <label><span>Availability</span><select defaultValue="Remaining"><option>Remaining</option><option>Available</option><option>All</option></select></label>
                  <button onClick={() => setShowCompleted(!showCompleted)}><span>Show Completed</span><em>{showCompleted ? "✓" : ""}</em></button>
                  <button><span>Group by Project</span><em>✓</em></button>
                </div>
              )}
            </div>
          </div>
          <div className="toolbar-section center-tools">
            <button className="tool primary-tool" onClick={() => addAction()} aria-label="Add a new action"><span className="tool-glyph plus-glyph">＋</span><small>New Action</small></button>
            <button className="tool" onClick={() => setQuickEntry(true)} aria-label="Open quick entry"><span className="tool-glyph quick-glyph">⌑</span><small>Quick Entry</small></button>
            <button className="tool" onClick={focusSelected} aria-label="Focus on selected project"><span className="tool-glyph focus-glyph">◎</span><small>Focus</small></button>
          </div>
          <div className="toolbar-section trailing-tools">
            <button className={`tool ${searchOpen ? "active" : ""}`} onClick={() => setSearchOpen(!searchOpen)} aria-label="Search"><span className="tool-glyph search-glyph" /><small>Search</small></button>
            <button className={`tool ${inspectorVisible ? "active" : ""}`} onClick={() => setInspectorVisible(!inspectorVisible)} aria-label="Toggle inspector"><span className="tool-glyph info-glyph">ⓘ</span><small>Inspect</small></button>
          </div>
        </header>

        {searchOpen && (
          <div className="search-strip">
            <span className="search-glyph" />
            <input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search Remaining" aria-label="Search remaining actions" />
            <button onClick={() => { setQuery(""); setSearchOpen(false); }}>Done</button>
          </div>
        )}

        <div className="workspace">
          <nav className="perspective-bar" aria-label="Perspectives">
            {perspectiveItems.map((item) => (
              <button key={item.name} className={perspective === item.name && !projectFilter ? "current" : ""} onClick={() => changePerspective(item.name)}>
                <span className={`perspective-icon ${item.name.toLowerCase()}`}>{item.glyph}</span>
                <span>{item.name}</span>
                {item.badge && <em>{item.badge}</em>}
              </button>
            ))}
            <button className="more-perspectives"><span className="perspective-icon">•••</span><span>More</span></button>
          </nav>

          {sidebarVisible && (
            <aside className="sidebar">
              <div className="sidebar-title">
                <h2>{perspective === "Projects" ? "Projects" : perspective}</h2>
                <button aria-label="More sidebar options">•••</button>
              </div>
              {perspective === "Projects" ? (
                <div className="project-list">
                  <button className={projectFilter === null ? "chosen" : ""} onClick={() => setProjectFilter(null)}>
                    <span className="sidebar-status inbox-mini">▱</span><b>All Projects</b><em>{tasks.filter((task) => task.project !== "Inbox" && !task.done).length}</em>
                  </button>
                  <div className="sidebar-section-label">PROJECTS</div>
                  {projectData.map((project) => (
                    <button key={project.name} className={projectFilter === project.name ? "chosen" : ""} onClick={() => setProjectFilter(project.name)}>
                      <span className="sidebar-status" style={{ borderColor: project.color }} />
                      <b>{project.name}</b>
                      <em>{tasks.filter((task) => task.project === project.name && !task.done).length}</em>
                    </button>
                  ))}
                </div>
              ) : perspective === "Tags" ? (
                <div className="project-list tag-list">
                  {["Tutorial", "Home", "Errands", "Mac", "Phone"].map((tag) => <button key={tag}><span className="hash">#</span><b>{tag}</b><em>{tasks.filter((task) => task.tags.includes(tag)).length}</em></button>)}
                </div>
              ) : perspective === "Forecast" ? (
                <div className="forecast-sidebar">
                  <button><b>Past</b><em>1</em></button>
                  {["SAT 15", "SUN 16", "MON 17", "TUE 18", "WED 19"].map((date, index) => <button className={index === 0 ? "chosen" : ""} key={date}><span>{date.split(" ")[0]}</span><b>{date.split(" ")[1]}</b>{index < 2 && <em>•</em>}</button>)}
                </div>
              ) : (
                <div className="sidebar-empty-state">
                  <span>{perspective === "Inbox" ? "▾" : perspective === "Flagged" ? "⚑" : "✓"}</span>
                  <p>{perspective === "Inbox" ? "Unsorted actions land here." : `Your ${perspective.toLowerCase()} items appear here.`}</p>
                </div>
              )}
              <button className="sidebar-add" onClick={() => addAction()}>＋ <span>New Project</span></button>
            </aside>
          )}

          <section className="outline" aria-label={`${title} outline`}>
            <div className="outline-header">
              <div>
                <h1>{title}</h1>
                <p>{visibleTasks.filter((task) => !task.done).length} actions{perspective === "Projects" && !projectFilter ? " • 3 projects" : ""}</p>
              </div>
              <button aria-label="Outline options">•••</button>
            </div>

            <div className="outline-scroll">
              {perspective === "Review" ? (
                <div className="review-card">
                  <span className="review-check">✓</span>
                  <h2>Review your projects</h2>
                  <p>Regular reviews keep your projects current and help you choose the next action with confidence.</p>
                  <button onClick={() => changePerspective("Projects")}>Start Review</button>
                </div>
              ) : perspective === "Projects" ? (
                projectData.filter((project) => !projectFilter || project.name === projectFilter).map((project) => {
                  const projectTasks = visibleTasks.filter((task) => task.project === project.name);
                  if (query && projectTasks.length === 0) return null;
                  return (
                    <div className="project-group" key={project.name}>
                      <div className="project-heading">
                        <span className="disclosure">⌄</span>
                        <span className="project-ring" style={{ borderColor: project.color }} />
                        <div><h2>{project.name}</h2><p>{project.note}</p></div>
                        <span className="project-count">{projectTasks.filter((task) => !task.done).length}</span>
                      </div>
                      {projectTasks.map(renderTask)}
                    </div>
                  );
                })
              ) : perspective === "Tags" ? (
                groupedByTag.map(([tag, tagTasks]) => (
                  <div className="project-group" key={tag}>
                    <div className="tag-heading"><span>#</span><div><h2>{tag}</h2><p>{tagTasks.length} actions</p></div></div>
                    {tagTasks.map(renderTask)}
                  </div>
                ))
              ) : (
                visibleTasks.length ? visibleTasks.map(renderTask) : (
                  <div className="empty-outline"><span>✓</span><h2>All clear</h2><p>There are no remaining actions in this view.</p></div>
                )
              )}
            </div>
            <button className="new-action-row" onClick={() => addAction()}><span>＋</span> New Action</button>
          </section>

          {inspectorVisible && selectedTask && (
            <aside className="inspector">
              <div className="inspector-tabs"><button className="selected">Action</button><button>Notes</button><button>Attachments</button></div>
              <div className="inspector-scroll">
                <div className="inspector-title-row">
                  <button className={`status-ring ${selectedTask.done ? "is-done" : ""}`} onClick={() => toggleComplete(selectedTask.id)}>{selectedTask.done ? "✓" : ""}</button>
                  <textarea rows={2} value={selectedTask.title} onChange={(event) => updateSelected({ title: event.target.value })} aria-label="Action title" />
                  <button className={`inspector-flag ${selectedTask.flagged ? "on" : ""}`} onClick={() => updateSelected({ flagged: !selectedTask.flagged })} aria-label="Flag action">⚑</button>
                </div>

                <section className="inspector-section">
                  <h3>Organization</h3>
                  <label><span>Project</span><select value={selectedTask.project} onChange={(event) => updateSelected({ project: event.target.value })}><option>Inbox</option>{projectData.map((project) => <option key={project.name}>{project.name}</option>)}</select></label>
                  <label><span>Tags</span><div className="tag-field">{selectedTask.tags.map((tag) => <i key={tag}>{tag}</i>)}<input aria-label="Add tag" placeholder={selectedTask.tags.length ? "" : "Add Tag"} /></div></label>
                </section>

                <section className="inspector-section">
                  <h3>Dates</h3>
                  <label><span>Defer Until</span><input value={selectedTask.defer || ""} onChange={(event) => updateSelected({ defer: event.target.value })} placeholder="None" /></label>
                  <label><span>Due</span><input value={selectedTask.due || ""} onChange={(event) => updateSelected({ due: event.target.value })} placeholder="None" /></label>
                  <label><span>Estimated Duration</span><input placeholder="None" /></label>
                </section>

                <section className="inspector-section">
                  <h3>Action</h3>
                  <label><span>Type</span><select defaultValue="Sequential"><option>Sequential</option><option>Parallel</option><option>Single Actions</option></select></label>
                  <label><span>Repeat</span><button className="plain-value">Doesn’t Repeat <b>›</b></button></label>
                </section>

                <section className="inspector-section note-section">
                  <h3>Note</h3>
                  <textarea value={selectedTask.note || ""} onChange={(event) => updateSelected({ note: event.target.value })} placeholder="Add a note…" rows={5} />
                </section>
              </div>
            </aside>
          )}
        </div>
      </section>

      {quickEntry && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setQuickEntry(false)}>
          <form className="quick-entry" onSubmit={(event) => { event.preventDefault(); saveQuickEntry(); }}>
            <div className="quick-titlebar"><span>Quick Entry</span><kbd>⌘⌃Space</kbd></div>
            <div className="quick-task-line">
              <span className="status-ring" />
              <input autoFocus value={quickTitle} onChange={(event) => setQuickTitle(event.target.value)} placeholder="What do you want to do?" aria-label="New action title" />
              <button type="button">⚑</button>
            </div>
            <div className="quick-fields"><button type="button">▱ Inbox</button><button type="button"># Tags</button><button type="button">▦ Due</button><button type="button">↻ Repeat</button></div>
            <div className="quick-footer"><span>Return to save</span><button type="button" onClick={() => setQuickEntry(false)}>Cancel</button><button type="submit" disabled={!quickTitle.trim()}>Save</button></div>
          </form>
        </div>
      )}
    </main>
  );
}
