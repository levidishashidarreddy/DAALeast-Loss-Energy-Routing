/**
 * GRIDFLOW — Intelligent Microgrid Energy Route Optimizer
 * Frontend Application Controller (Vanilla JS)
 * Communicates with Native C Engine via Python Process Bridge
 * (Single Source of Truth: microgrid_router.exe)
 */

(function () {
    'use strict';

    // Application State
    const state = {
        activeGraph: {
            vertices: 5,
            edges: [
                { src: 0, dest: 1, weight: 4 },
                { src: 0, dest: 2, weight: 2 },
                { src: 1, dest: 2, weight: 3 },
                { src: 2, dest: 1, weight: 1 },
                { src: 1, dest: 3, weight: 2 },
                { src: 2, dest: 4, weight: 4 },
                { src: 3, dest: 4, weight: 3 }
            ]
        },
        samples: [],
        activeSampleId: 'normal',
        nodePositions: {},
        selectedSource: 0,
        selectedDestination: 4,
        selectedAlgorithm: 'dijkstra',
        highlightPath: [],
        highlightCycle: [],
        draggingNode: null,
        dragOffset: { x: 0, y: 0 },
        benchmarkRows: [],
        animOffset: 0,
        toastTimer: null
    };

    const NODE_ROLES = [
        "Solar Prosumer",
        "Battery BESS",
        "Industrial Substation",
        "Commercial Grid",
        "Residential Load",
        "Wind Generator",
        "Micro-Hydro Unit",
        "EV Depot Hub",
        "Bio-Gas Substation",
        "Data Center Feeder"
    ];

    // DOM Elements Cache
    const elements = {
        cEngineStatus: document.getElementById('cEngineStatus'),
        cEngineTextStatus: document.getElementById('cEngineTextStatus'),
        statNodesCount: document.getElementById('statNodesCount'),
        statEdgesCount: document.getElementById('statEdgesCount'),
        statNegativeCount: document.getElementById('statNegativeCount'),
        presetButtons: document.getElementById('presetButtons'),
        networkCanvas: document.getElementById('networkCanvas'),
        btnResetView: document.getElementById('btnResetView'),
        btnToggleEditor: document.getElementById('btnToggleEditor'),
        btnCloseEditor: document.getElementById('btnCloseEditor'),
        topologyDrawer: document.getElementById('topologyEditorDrawer'),
        topologyDesc: document.getElementById('topologyDescription'),
        tabLineList: document.getElementById('tabLineList'),
        tabRawFormat: document.getElementById('tabRawFormat'),
        panelLineList: document.getElementById('panelLineList'),
        panelRawFormat: document.getElementById('panelRawFormat'),
        inputNumNodes: document.getElementById('inputNumNodes'),
        btnSetNodes: document.getElementById('btnSetNodes'),
        edgeListTbody: document.getElementById('edgeListTbody'),
        newEdgeSrc: document.getElementById('newEdgeSrc'),
        newEdgeDest: document.getElementById('newEdgeDest'),
        newEdgeWeight: document.getElementById('newEdgeWeight'),
        btnAddEdge: document.getElementById('btnAddEdge'),
        rawGraphText: document.getElementById('rawGraphText'),
        btnApplyRaw: document.getElementById('btnApplyRaw'),
        selectSource: document.getElementById('selectSource'),
        selectDestination: document.getElementById('selectDestination'),
        algoRadios: document.querySelectorAll('input[name="algorithmSelect"]'),
        dijkstraWarningBanner: document.getElementById('dijkstraWarningBanner'),
        btnAutoSwitchBellman: document.getElementById('btnAutoSwitchBellman'),
        btnKeepDijkstra: document.getElementById('btnKeepDijkstra'),
        btnFindRoute: document.getElementById('btnFindRoute'),
        btnCompareBoth: document.getElementById('btnCompareBoth'),
        routePlaceholder: document.getElementById('routePlaceholder'),
        routeResultCard: document.getElementById('routeResultCard'),
        resultStatusBadge: document.getElementById('resultStatusBadge'),
        resultAlgoTitle: document.getElementById('resultAlgoTitle'),
        resultExecutionTime: document.getElementById('resultExecutionTime'),
        resultOptimalPanel: document.getElementById('resultOptimalPanel'),
        resultTotalCost: document.getElementById('resultTotalCost'),
        resultHopCount: document.getElementById('resultHopCount'),
        resultVerificationLabel: document.getElementById('resultVerificationLabel'),
        resultPathSequence: document.getElementById('resultPathSequence'),
        resultHopsBreakdown: document.getElementById('resultHopsBreakdown'),
        resultCyclePanel: document.getElementById('resultCyclePanel'),
        resultCyclePath: document.getElementById('resultCyclePath'),
        resultUnreachablePanel: document.getElementById('resultUnreachablePanel'),
        resultUnreachableMsg: document.getElementById('resultUnreachableMsg'),
        comparisonVivaCard: document.getElementById('comparisonVivaCard'),
        btnCloseComparison: document.getElementById('btnCloseComparison'),
        vivaDijkstraBody: document.getElementById('vivaDijkstraBody'),
        vivaBellmanBody: document.getElementById('vivaBellmanBody'),
        vivaVerdict: document.getElementById('vivaVerdict'),
        benchmarkTable: document.getElementById('benchmarkTable'),
        benchmarkTbody: document.getElementById('benchmarkTbody'),
        btnRerunBenchmark: document.getElementById('btnRerunBenchmark'),
        benchmarkChartCanvas: document.getElementById('benchmarkChart'),
        statDijkstra10k: document.getElementById('statDijkstra10k'),
        statMaxSpeedup: document.getElementById('statMaxSpeedup'),
        statBf10k: document.getElementById('statBf10k'),
        heroMiniCanvas: document.getElementById('heroMiniCanvas'),
        toast: document.getElementById('toastNotification')
    };

    const ctx = elements.networkCanvas.getContext('2d');
    const chartCtx = elements.benchmarkChartCanvas.getContext('2d');
    const heroCtx = elements.heroMiniCanvas ? elements.heroMiniCanvas.getContext('2d') : null;

    // Initialization
    async function init() {
        initTabs();
        initCanvasInteraction();
        initEventListeners();
        calculateDefaultNodePositions();

        await checkBackendStatus();
        await loadSamplePresets();
        await loadBenchmarks();

        updateUI();
        startAnimationLoops();

        // Handle URL parameters for demonstration
        handleUrlParams();
    }

    function handleUrlParams() {
        const urlParams = new URLSearchParams(window.location.search);
        if (urlParams.has('preset')) {
            const pId = urlParams.get('preset');
            const found = state.samples.find(s => s.id === pId);
            if (found) {
                applySamplePreset(found);
            }
        }
        if (urlParams.has('algo')) {
            const a = urlParams.get('algo');
            state.selectedAlgorithm = a;
            const r = document.querySelector(`input[name="algorithmSelect"][value="${a}"]`);
            if (r) r.checked = true;
            checkDijkstraWarning();
        }
        if (urlParams.has('autorun')) {
            setTimeout(findCheapestRoute, 400);
        }
        if (urlParams.has('compare')) {
            setTimeout(compareBothAlgorithms, 400);
        }
    }

    // Backend Connectivity Check
    async function checkBackendStatus() {
        try {
            const res = await fetch('/api/status');
            if (res.ok) {
                const data = await res.json();
                if (data.online) {
                    elements.cEngineStatus.innerHTML = `
                        <span class="status-pulse"></span>
                        <span class="status-label">C Engine Online (GCC)</span>
                    `;
                    if (elements.cEngineTextStatus) {
                        elements.cEngineTextStatus.textContent = 'Native GCC';
                    }
                }
            }
        } catch (e) {
            elements.cEngineStatus.innerHTML = `
                <span class="status-pulse" style="background:#f43f5e;box-shadow:none;"></span>
                <span class="status-label" style="color:#f43f5e;">Bridge Offline</span>
            `;
            if (elements.cEngineTextStatus) {
                elements.cEngineTextStatus.textContent = 'Offline';
            }
            showToast('Python C-Bridge offline on port 8000', 'error');
        }
    }

    // Load Sample Topologies
    async function loadSamplePresets() {
        try {
            const res = await fetch('/api/samples');
            if (res.ok) {
                state.samples = await res.json();
                renderPresetButtons();
            }
        } catch (e) {
            console.warn('Could not load samples', e);
        }
    }

    function renderPresetButtons() {
        elements.presetButtons.innerHTML = '';
        state.samples.forEach(sample => {
            const btn = document.createElement('button');
            btn.className = `preset-pill ${sample.id === state.activeSampleId ? 'active' : ''}`;
            btn.textContent = sample.name.replace(/\s*\(.*\)/, '');
            btn.title = sample.description;
            btn.addEventListener('click', () => applySamplePreset(sample));
            elements.presetButtons.appendChild(btn);
        });
    }

    function applySamplePreset(sample) {
        state.activeSampleId = sample.id;
        state.activeGraph = {
            vertices: sample.vertices,
            edges: JSON.parse(JSON.stringify(sample.edges))
        };
        state.selectedSource = sample.suggestedSource;
        state.selectedDestination = sample.suggestedDestination;
        state.highlightPath = [];
        state.highlightCycle = [];

        elements.topologyDesc.textContent = sample.description;

        // Reset results to placeholder
        if (elements.routePlaceholder) elements.routePlaceholder.style.display = 'flex';
        if (elements.routeResultCard) elements.routeResultCard.style.display = 'none';
        if (elements.comparisonVivaCard) elements.comparisonVivaCard.style.display = 'none';

        renderPresetButtons();
        calculateDefaultNodePositions();
        updateUI();

        showToast(`Loaded: ${sample.name}`);
    }

    // Calculate Default Geometric Node Positions
    function calculateDefaultNodePositions() {
        const V = state.activeGraph.vertices;
        const width = elements.networkCanvas.width;
        const height = elements.networkCanvas.height;
        const centerX = width / 2;
        const centerY = height / 2;
        const radius = Math.min(width, height) * 0.38;

        state.nodePositions = {};
        for (let i = 0; i < V; i++) {
            const angle = (2 * Math.PI * i) / V - Math.PI / 2;
            state.nodePositions[i] = {
                x: centerX + radius * Math.cos(angle),
                y: centerY + radius * Math.sin(angle)
            };
        }
    }

    // UI Updates
    function updateUI() {
        const V = state.activeGraph.vertices;
        const E = state.activeGraph.edges.length;
        const negCount = state.activeGraph.edges.filter(e => e.weight < 0).length;

        elements.statNodesCount.textContent = V;
        elements.statEdgesCount.textContent = E;
        elements.statNegativeCount.textContent = negCount;
        elements.inputNumNodes.value = V;

        populateNodeSelect(elements.selectSource, V, state.selectedSource);
        populateNodeSelect(elements.selectDestination, V, state.selectedDestination);

        renderEdgeListTable();
        syncRawGraphTextarea();
        checkDijkstraWarning();
    }

    function populateNodeSelect(selectElem, count, selectedVal) {
        selectElem.innerHTML = '';
        for (let i = 0; i < count; i++) {
            const opt = document.createElement('option');
            opt.value = i;
            const role = i < NODE_ROLES.length ? `• ${NODE_ROLES[i]}` : '';
            opt.textContent = `Node ${i} ${role}`;
            if (i === selectedVal) opt.selected = true;
            selectElem.appendChild(opt);
        }
    }

    function renderEdgeListTable() {
        elements.edgeListTbody.innerHTML = '';
        state.activeGraph.edges.forEach((edge, idx) => {
            const tr = document.createElement('tr');
            const isRebate = edge.weight < 0;
            tr.innerHTML = `
                <td><code>Node ${edge.src} &rarr; ${edge.dest}</code></td>
                <td>
                    <span class="${isRebate ? 'text-emerald' : ''}">
                        ${edge.weight > 0 ? '+' : ''}${edge.weight} units
                        ${isRebate ? ' (Rebate)' : ''}
                    </span>
                </td>
                <td>
                    <button class="btn-del-line" data-index="${idx}" title="Delete Line">&times;</button>
                </td>
            `;
            elements.edgeListTbody.appendChild(tr);
        });

        elements.edgeListTbody.querySelectorAll('.btn-del-line').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
                state.activeGraph.edges.splice(idx, 1);
                state.highlightPath = [];
                state.highlightCycle = [];
                updateUI();
            });
        });
    }

    function syncRawGraphTextarea() {
        let text = `${state.activeGraph.vertices} ${state.activeGraph.edges.length}\n`;
        state.activeGraph.edges.forEach(e => {
            text += `${e.src} ${e.dest} ${e.weight}\n`;
        });
        elements.rawGraphText.value = text.trim();
    }

    function checkDijkstraWarning() {
        const hasNeg = state.activeGraph.edges.some(e => e.weight < 0);
        const isDijkstra = state.selectedAlgorithm === 'dijkstra';
        if (hasNeg && isDijkstra) {
            elements.dijkstraWarningBanner.style.display = 'flex';
        } else {
            elements.dijkstraWarningBanner.style.display = 'none';
        }
    }

    // Animation Loops
    function startAnimationLoops() {
        function loop() {
            state.animOffset = (state.animOffset + 0.6) % 32;
            drawNetwork();
            if (heroCtx) drawHeroMiniCanvas();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }

    // Hero Mini Canvas Visualizer
    function drawHeroMiniCanvas() {
        const w = elements.heroMiniCanvas.width;
        const h = elements.heroMiniCanvas.height;
        heroCtx.clearRect(0, 0, w, h);

        const nodes = [
            { x: 70, y: 120, label: "0", name: "Solar" },
            { x: 190, y: 55, label: "1", name: "BESS" },
            { x: 190, y: 185, label: "2", name: "Ind" },
            { x: 310, y: 120, label: "3", name: "Grid" }
        ];

        const lines = [
            { u: 0, v: 1, w: "+4" },
            { u: 0, v: 2, w: "+2" },
            { u: 1, v: 2, w: "-3" },
            { u: 1, v: 3, w: "+5" },
            { u: 2, v: 3, w: "+3" }
        ];

        // Draw Lines
        lines.forEach(l => {
            const p1 = nodes[l.u];
            const p2 = nodes[l.v];

            heroCtx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            heroCtx.lineWidth = 1.5;
            heroCtx.beginPath();
            heroCtx.moveTo(p1.x, p1.y);
            heroCtx.lineTo(p2.x, p2.y);
            heroCtx.stroke();

            // Animated Energy Pulse along 0 -> 2 -> 3
            if ((l.u === 0 && l.v === 2) || (l.u === 2 && l.v === 3)) {
                heroCtx.strokeStyle = "#38bdf8";
                heroCtx.lineWidth = 2.5;
                heroCtx.setLineDash([6, 6]);
                heroCtx.lineDashOffset = -state.animOffset;
                heroCtx.beginPath();
                heroCtx.moveTo(p1.x, p1.y);
                heroCtx.lineTo(p2.x, p2.y);
                heroCtx.stroke();
                heroCtx.setLineDash([]);
            }
        });

        // Draw Nodes
        nodes.forEach(n => {
            heroCtx.beginPath();
            heroCtx.arc(n.x, n.y, 16, 0, 2 * Math.PI);
            heroCtx.fillStyle = "rgba(18, 25, 43, 0.9)";
            heroCtx.strokeStyle = "rgba(14, 165, 233, 0.6)";
            heroCtx.lineWidth = 2;
            heroCtx.fill();
            heroCtx.stroke();

            heroCtx.font = "600 11px JetBrains Mono";
            heroCtx.fillStyle = "#ffffff";
            heroCtx.textAlign = "center";
            heroCtx.textBaseline = "middle";
            heroCtx.fillText(n.label, n.x, n.y);

            heroCtx.font = "10px Inter";
            heroCtx.fillStyle = "#94a3b8";
            heroCtx.fillText(n.name, n.x, n.y + 24);
        });
    }

    // Network Canvas Main Rendering
    function drawNetwork() {
        const width = elements.networkCanvas.width;
        const height = elements.networkCanvas.height;

        ctx.clearRect(0, 0, width, height);

        drawCanvasGrid(width, height);

        const edgeMap = {};
        state.activeGraph.edges.forEach(e => {
            const key = `${Math.min(e.src, e.dest)}_${Math.max(e.src, e.dest)}`;
            edgeMap[key] = (edgeMap[key] || 0) + 1;
        });

        // 1. Draw Transmission Lines
        state.activeGraph.edges.forEach(edge => {
            const posU = state.nodePositions[edge.src];
            const posV = state.nodePositions[edge.dest];
            if (!posU || !posV) return;

            const isBidirectional = edgeMap[`${Math.min(edge.src, edge.dest)}_${Math.max(edge.src, edge.dest)}`] > 1;
            const isPathEdge = isEdgeInPath(edge.src, edge.dest);
            const isCycleEdge = isEdgeInCycle(edge.src, edge.dest);
            const isRebate = edge.weight < 0;

            drawDirectedEdge(posU, posV, edge.weight, isBidirectional, isPathEdge, isCycleEdge, isRebate);
        });

        // 2. Draw Substations / Prosumer Nodes
        const V = state.activeGraph.vertices;
        for (let i = 0; i < V; i++) {
            const pos = state.nodePositions[i];
            if (!pos) continue;

            const isSource = i === state.selectedSource;
            const isDest = i === state.selectedDestination;
            const isInPath = state.highlightPath.includes(i);
            const isInCycle = state.highlightCycle.includes(i);

            drawNode(i, pos.x, pos.y, isSource, isDest, isInPath, isInCycle);
        }
    }

    function drawCanvasGrid(w, h) {
        ctx.strokeStyle = "rgba(255, 255, 255, 0.02)";
        ctx.lineWidth = 1;
        const step = 48;
        ctx.beginPath();
        for (let x = 0; x < w; x += step) {
            ctx.moveTo(x, 0);
            ctx.lineTo(x, h);
        }
        for (let y = 0; y < h; y += step) {
            ctx.moveTo(0, y);
            ctx.lineTo(w, y);
        }
        ctx.stroke();
    }

    function drawDirectedEdge(u, v, weight, isCurved, isPath, isCycle, isRebate) {
        const nodeRadius = 24;
        const dx = v.x - u.x;
        const dy = v.y - u.y;
        const dist = Math.hypot(dx, dy);
        if (dist === 0) return;

        const nx = dx / dist;
        const ny = dy / dist;

        let midX = (u.x + v.x) / 2;
        let midY = (u.y + v.y) / 2;
        const curveFactor = isCurved ? 26 : 0;
        midX += -ny * curveFactor;
        midY += nx * curveFactor;

        const targetX = v.x - nx * (nodeRadius + 4);
        const targetY = v.y - ny * (nodeRadius + 4);
        const startX = u.x + nx * nodeRadius;
        const startY = u.y + ny * nodeRadius;

        ctx.save();

        if (isCycle) {
            ctx.strokeStyle = "#f43f5e";
            ctx.lineWidth = 3;
            ctx.shadowColor = "rgba(244, 63, 94, 0.5)";
            ctx.shadowBlur = 8;
        } else if (isPath) {
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 3;
            ctx.shadowColor = "rgba(56, 189, 248, 0.6)";
            ctx.shadowBlur = 10;
            // Animated pulse dashes
            ctx.setLineDash([8, 6]);
            ctx.lineDashOffset = -state.animOffset;
        } else if (isRebate) {
            ctx.strokeStyle = "rgba(16, 185, 129, 0.75)";
            ctx.lineWidth = 1.8;
            ctx.shadowBlur = 0;
        } else {
            ctx.strokeStyle = "rgba(255, 255, 255, 0.14)";
            ctx.lineWidth = 1.5;
            ctx.shadowBlur = 0;
        }

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        if (isCurved) {
            ctx.quadraticCurveTo(midX, midY, targetX, targetY);
        } else {
            ctx.lineTo(targetX, targetY);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Subtle Arrowhead
        const arrowAngle = isCurved ? Math.atan2(targetY - midY, targetX - midX) : Math.atan2(dy, dx);
        const arrowLength = 9;
        ctx.fillStyle = ctx.strokeStyle;
        ctx.beginPath();
        ctx.moveTo(targetX, targetY);
        ctx.lineTo(
            targetX - arrowLength * Math.cos(arrowAngle - Math.PI / 7),
            targetY - arrowLength * Math.sin(arrowAngle - Math.PI / 7)
        );
        ctx.lineTo(
            targetX - arrowLength * Math.cos(arrowAngle + Math.PI / 7),
            targetY - arrowLength * Math.sin(arrowAngle + Math.PI / 7)
        );
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        drawWeightBadge(midX, midY, weight, isRebate, isPath, isCycle);
    }

    function drawWeightBadge(x, y, weight, isRebate, isPath, isCycle) {
        ctx.save();
        const text = `${weight > 0 ? '+' : ''}${weight}`;
        ctx.font = '600 11px JetBrains Mono';
        const textWidth = ctx.measureText(text).width;
        const badgeW = textWidth + 14;
        const badgeH = 18;

        if (isCycle) {
            ctx.fillStyle = "rgba(76, 5, 25, 0.9)";
            ctx.strokeStyle = "#f43f5e";
        } else if (isPath) {
            ctx.fillStyle = "rgba(8, 47, 73, 0.95)";
            ctx.strokeStyle = "#38bdf8";
        } else if (isRebate) {
            ctx.fillStyle = "rgba(6, 78, 59, 0.9)";
            ctx.strokeStyle = "rgba(16, 185, 129, 0.8)";
        } else {
            ctx.fillStyle = "rgba(15, 23, 42, 0.9)";
            ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
        }

        ctx.lineWidth = 1;
        roundRect(ctx, x - badgeW / 2, y - badgeH / 2, badgeW, badgeH, 4, true, true);

        if (isRebate) ctx.fillStyle = "#6ee7b7";
        else if (isPath) ctx.fillStyle = "#bae6fd";
        else if (isCycle) ctx.fillStyle = "#fda4af";
        else ctx.fillStyle = "#94a3b8";

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);

        ctx.restore();
    }

    function drawNode(id, x, y, isSource, isDest, inPath, inCycle) {
        const radius = 22;
        ctx.save();

        if (inCycle) {
            ctx.shadowColor = "rgba(244, 63, 94, 0.6)";
            ctx.shadowBlur = 12;
        } else if (isSource) {
            ctx.shadowColor = "rgba(16, 185, 129, 0.6)";
            ctx.shadowBlur = 12;
        } else if (isDest) {
            ctx.shadowColor = "rgba(14, 165, 233, 0.6)";
            ctx.shadowBlur = 12;
        } else if (inPath) {
            ctx.shadowColor = "rgba(56, 189, 248, 0.5)";
            ctx.shadowBlur = 10;
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, 2 * Math.PI);

        if (isSource) {
            ctx.fillStyle = "rgba(6, 78, 59, 0.85)";
            ctx.strokeStyle = "#10b981";
            ctx.lineWidth = 2.5;
        } else if (isDest) {
            ctx.fillStyle = "rgba(2, 132, 199, 0.85)";
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2.5;
        } else if (inCycle) {
            ctx.fillStyle = "rgba(136, 19, 55, 0.85)";
            ctx.strokeStyle = "#f43f5e";
            ctx.lineWidth = 2.5;
        } else if (inPath) {
            ctx.fillStyle = "rgba(12, 74, 110, 0.85)";
            ctx.strokeStyle = "#38bdf8";
            ctx.lineWidth = 2.2;
        } else {
            ctx.fillStyle = "rgba(18, 25, 43, 0.85)";
            ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
            ctx.lineWidth = 1.6;
        }

        ctx.fill();
        ctx.stroke();
        ctx.restore();

        // Node ID
        ctx.save();
        ctx.font = '700 13px JetBrains Mono';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText(id, x, y - 1);

        // Role Label
        const role = id < NODE_ROLES.length ? NODE_ROLES[id] : `Substation ${id}`;
        ctx.font = '500 10px Inter';
        ctx.fillStyle = isSource ? '#a7f3d0' : (isDest ? '#bae6fd' : '#94a3b8');
        ctx.fillText(role, x, y + radius + 14);

        if (isSource) {
            drawTagPill(x, y - radius - 11, 'SELLER', '#10b981');
        } else if (isDest) {
            drawTagPill(x, y - radius - 11, 'BUYER', '#38bdf8');
        }

        ctx.restore();
    }

    function drawTagPill(x, y, text, color) {
        ctx.save();
        ctx.font = '700 9px Inter';
        const w = ctx.measureText(text).width + 8;
        const h = 14;
        ctx.fillStyle = color;
        roundRect(ctx, x - w / 2, y - h / 2, w, h, 3, true, false);
        ctx.fillStyle = '#080c14';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    function roundRect(ctx, x, y, width, height, radius, fill, stroke) {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.lineTo(x + width - radius, y);
        ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
        ctx.lineTo(x + width, y + height - radius);
        ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
        ctx.lineTo(x + radius, y + height);
        ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
        ctx.lineTo(x, y + radius);
        ctx.quadraticCurveTo(x, y, x + radius, y);
        ctx.closePath();
        if (fill) ctx.fill();
        if (stroke) ctx.stroke();
    }

    function isEdgeInPath(src, dest) {
        if (!state.highlightPath || state.highlightPath.length < 2) return false;
        for (let i = 0; i < state.highlightPath.length - 1; i++) {
            if (state.highlightPath[i] === src && state.highlightPath[i + 1] === dest) {
                return true;
            }
        }
        return false;
    }

    function isEdgeInCycle(src, dest) {
        if (!state.highlightCycle || state.highlightCycle.length < 2) return false;
        for (let i = 0; i < state.highlightCycle.length - 1; i++) {
            if (state.highlightCycle[i] === src && state.highlightCycle[i + 1] === dest) {
                return true;
            }
        }
        return false;
    }

    // Canvas Node Dragging & Selection Interactions
    function initCanvasInteraction() {
        const canvas = elements.networkCanvas;

        canvas.addEventListener('mousedown', (e) => {
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;

            for (let i = 0; i < state.activeGraph.vertices; i++) {
                const pos = state.nodePositions[i];
                if (!pos) continue;
                const d = Math.hypot(mouseX - pos.x, mouseY - pos.y);
                if (d <= 24) {
                    state.draggingNode = i;
                    state.dragOffset = { x: mouseX - pos.x, y: mouseY - pos.y };

                    if (e.shiftKey) {
                        state.selectedDestination = i;
                        elements.selectDestination.value = i;
                    } else if (e.altKey) {
                        state.selectedSource = i;
                        elements.selectSource.value = i;
                    }
                    break;
                }
            }
        });

        window.addEventListener('mousemove', (e) => {
            if (state.draggingNode === null) return;
            const rect = canvas.getBoundingClientRect();
            const scaleX = canvas.width / rect.width;
            const scaleY = canvas.height / rect.height;
            const mouseX = (e.clientX - rect.left) * scaleX;
            const mouseY = (e.clientY - rect.top) * scaleY;

            state.nodePositions[state.draggingNode] = {
                x: Math.max(30, Math.min(canvas.width - 30, mouseX - state.dragOffset.x)),
                y: Math.max(30, Math.min(canvas.height - 30, mouseY - state.dragOffset.y))
            };
        });

        window.addEventListener('mouseup', () => {
            state.draggingNode = null;
        });

        elements.btnResetView.addEventListener('click', () => {
            calculateDefaultNodePositions();
            showToast('Layout re-centered');
        });
    }

    // UI Event Listeners
    function initEventListeners() {
        // Toggle Topology Editor Drawer
        elements.btnToggleEditor.addEventListener('click', () => {
            elements.topologyDrawer.classList.toggle('open');
        });
        elements.btnCloseEditor.addEventListener('click', () => {
            elements.topologyDrawer.classList.remove('open');
        });

        // Source & Destination Selectors
        elements.selectSource.addEventListener('change', (e) => {
            state.selectedSource = parseInt(e.target.value, 10);
        });
        elements.selectDestination.addEventListener('change', (e) => {
            state.selectedDestination = parseInt(e.target.value, 10);
        });

        // Algorithm Selection
        elements.algoRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                state.selectedAlgorithm = e.target.value;
                checkDijkstraWarning();
            });
        });

        // Dijkstra Warning Controls
        elements.btnAutoSwitchBellman.addEventListener('click', () => {
            state.selectedAlgorithm = 'bellman-ford';
            document.querySelector('input[value="bellman-ford"]').checked = true;
            checkDijkstraWarning();
            showToast('Switched to Bellman-Ford');
        });

        elements.btnKeepDijkstra.addEventListener('click', () => {
            elements.dijkstraWarningBanner.style.display = 'none';
            findCheapestRoute();
        });

        // Add Line Form
        elements.btnAddEdge.addEventListener('click', () => {
            const src = parseInt(elements.newEdgeSrc.value, 10);
            const dest = parseInt(elements.newEdgeDest.value, 10);
            const weight = parseInt(elements.newEdgeWeight.value, 10);
            const V = state.activeGraph.vertices;

            if (isNaN(src) || isNaN(dest) || isNaN(weight)) {
                showToast('Please enter valid source, destination, and weight values.', 'error');
                return;
            }
            if (src < 0 || src >= V || dest < 0 || dest >= V) {
                showToast(`Node index must be between 0 and ${V - 1}.`, 'error');
                return;
            }
            if (src === dest) {
                showToast('Self-loops are not allowed in this microgrid model.', 'error');
                return;
            }

            state.activeGraph.edges.push({ src, dest, weight });
            elements.newEdgeSrc.value = '';
            elements.newEdgeDest.value = '';
            elements.newEdgeWeight.value = '';
            state.highlightPath = [];
            state.highlightCycle = [];
            updateUI();
            showToast(`Added line: Node ${src} ➔ Node ${dest} (${weight} units)`);
        });

        // Set Total Nodes Count
        elements.btnSetNodes.addEventListener('click', () => {
            const newV = parseInt(elements.inputNumNodes.value, 10);
            if (isNaN(newV) || newV < 2 || newV > 50) {
                showToast('Vertices count must be between 2 and 50.', 'error');
                return;
            }
            state.activeGraph.vertices = newV;
            state.activeGraph.edges = state.activeGraph.edges.filter(e => e.src < newV && e.dest < newV);

            if (state.selectedSource >= newV) state.selectedSource = 0;
            if (state.selectedDestination >= newV) state.selectedDestination = newV - 1;

            calculateDefaultNodePositions();
            state.highlightPath = [];
            state.highlightCycle = [];
            updateUI();
            showToast(`Microgrid resized to ${newV} nodes`);
        });

        // Apply Raw Matrix Format
        elements.btnApplyRaw.addEventListener('click', () => {
            const text = elements.rawGraphText.value.trim();
            const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);
            if (lines.length < 1) {
                showToast('Format error: First line must contain <V> <E>', 'error');
                return;
            }

            const header = lines[0].split(/\s+/);
            const V = parseInt(header[0], 10);
            const E = parseInt(header[1], 10);

            if (isNaN(V) || isNaN(E) || V <= 0 || E < 0) {
                showToast('Invalid header format.', 'error');
                return;
            }

            const edges = [];
            for (let i = 1; i <= E && i < lines.length; i++) {
                const parts = lines[i].split(/\s+/);
                if (parts.length >= 3) {
                    const u = parseInt(parts[0], 10);
                    const v = parseInt(parts[1], 10);
                    const w = parseInt(parts[2], 10);
                    if (u >= 0 && u < V && v >= 0 && v < V) {
                        edges.push({ src: u, dest: v, weight: w });
                    }
                }
            }

            state.activeGraph = { vertices: V, edges };
            if (state.selectedSource >= V) state.selectedSource = 0;
            if (state.selectedDestination >= V) state.selectedDestination = V - 1;

            calculateDefaultNodePositions();
            state.highlightPath = [];
            state.highlightCycle = [];
            updateUI();
            showToast(`Imported topology with ${V} nodes & ${edges.length} lines`);
        });

        // Execute Route Solver
        elements.btnFindRoute.addEventListener('click', findCheapestRoute);

        // Compare Both Algorithms (Viva Mode)
        elements.btnCompareBoth.addEventListener('click', compareBothAlgorithms);
        elements.btnCloseComparison.addEventListener('click', () => {
            elements.comparisonVivaCard.style.display = 'none';
        });

        // Re-run Benchmark Suite
        elements.btnRerunBenchmark.addEventListener('click', rerunBenchmarkSuite);
    }

    // Drawer Tabs
    function initTabs() {
        elements.tabLineList.addEventListener('click', () => {
            elements.tabLineList.classList.add('active');
            elements.tabRawFormat.classList.remove('active');
            elements.panelLineList.classList.add('active');
            elements.panelRawFormat.classList.remove('active');
        });

        elements.tabRawFormat.addEventListener('click', () => {
            elements.tabRawFormat.classList.add('active');
            elements.tabLineList.classList.remove('active');
            elements.panelRawFormat.classList.add('active');
            elements.panelLineList.classList.remove('active');
            syncRawGraphTextarea();
        });
    }

    // Call Native C Engine via Python Bridge
    async function findCheapestRoute() {
        const payload = {
            algorithm: state.selectedAlgorithm,
            source: state.selectedSource,
            destination: state.selectedDestination,
            graph: state.activeGraph
        };

        elements.btnFindRoute.disabled = true;
        elements.btnFindRoute.innerHTML = `<span>Calculating in C...</span>`;

        try {
            const res = await fetch('/api/route', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });

            if (!res.ok) {
                const err = await res.json();
                throw new Error(err.error || 'Server error');
            }

            const data = await res.json();
            renderRouteResult(data);
        } catch (e) {
            showToast(`C Solver Error: ${e.message}`, 'error');
        } finally {
            elements.btnFindRoute.disabled = false;
            elements.btnFindRoute.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"></polygon>
                </svg>
                <span>Find Optimal Route</span>
            `;
        }
    }

    // Render C Solver Results in Clean Layout
    function renderRouteResult(result) {
        if (elements.routePlaceholder) elements.routePlaceholder.style.display = 'none';
        elements.routeResultCard.style.display = 'block';
        elements.resultAlgoTitle.textContent = result.algorithm;
        elements.resultExecutionTime.textContent = `${result.execution_time_ms.toFixed(4)} ms`;

        elements.resultOptimalPanel.style.display = 'none';
        elements.resultCyclePanel.style.display = 'none';
        elements.resultUnreachablePanel.style.display = 'none';

        state.highlightPath = [];
        state.highlightCycle = [];

        if (result.status === 1) {
            // Optimal Route
            elements.resultStatusBadge.className = 'badge badge-emerald';
            elements.resultStatusBadge.textContent = 'Optimal Route Computed';

            elements.resultOptimalPanel.style.display = 'block';
            elements.resultTotalCost.textContent = `${result.cost} units`;
            elements.resultHopCount.textContent = result.path.length > 1 ? result.path.length - 1 : 0;

            if (result.warning) {
                elements.resultStatusBadge.className = 'badge badge-amber';
                elements.resultStatusBadge.textContent = 'Suboptimal (Greedy Warning)';
                elements.resultVerificationLabel.innerHTML = `<span class="text-amber">Greedily Finalized</span>`;
            } else {
                elements.resultVerificationLabel.innerHTML = `<span class="text-emerald">Verified via GCC</span>`;
            }

            // Path sequence pills
            state.highlightPath = result.path;
            elements.resultPathSequence.innerHTML = '';
            result.path.forEach((node, i) => {
                const isSrc = i === 0;
                const isDst = i === result.path.length - 1;
                const pill = document.createElement('div');
                pill.className = `path-node-pill ${isSrc ? 'is-source' : ''} ${isDst ? 'is-dest' : ''}`;
                const role = node < NODE_ROLES.length ? `• ${NODE_ROLES[node]}` : '';
                pill.innerHTML = `<span>Node ${node}</span> <small>${role}</small>`;
                elements.resultPathSequence.appendChild(pill);

                if (i < result.path.length - 1) {
                    const arrow = document.createElement('span');
                    arrow.className = 'path-arrow-pill';
                    arrow.textContent = '➔';
                    elements.resultPathSequence.appendChild(arrow);
                }
            });

            // Hops breakdown
            elements.resultHopsBreakdown.innerHTML = '';
            for (let i = 0; i < result.path.length - 1; i++) {
                const u = result.path[i];
                const v = result.path[i + 1];
                const edge = state.activeGraph.edges.find(e => e.src === u && e.dest === v);
                const w = edge ? edge.weight : '?';
                const isRebate = w < 0;

                const hop = document.createElement('div');
                hop.className = 'hop-item';
                hop.innerHTML = `
                    <span>Hop ${i + 1}: ${u} &rarr; ${v}</span>
                    <span class="hop-weight ${isRebate ? 'rebate' : ''}">${w > 0 ? '+' : ''}${w} units</span>
                `;
                elements.resultHopsBreakdown.appendChild(hop);
            }

        } else if (result.status === -1) {
            // Negative Cycle Arbitrage Loop
            elements.resultStatusBadge.className = 'badge badge-rose';
            elements.resultStatusBadge.textContent = 'Arbitrage Loop Detected';

            elements.resultCyclePanel.style.display = 'block';
            state.highlightCycle = result.cycle || [];
            if (result.cycle && result.cycle.length > 0) {
                elements.resultCyclePath.textContent = result.cycle.map(n => `Node ${n}`).join(' ➔ ');
            } else {
                elements.resultCyclePath.textContent = 'Cycle detected (closed loop)';
            }

        } else {
            // Unreachable Destination
            elements.resultStatusBadge.className = 'badge badge-amber';
            elements.resultStatusBadge.textContent = 'Destination Unreachable';

            elements.resultUnreachablePanel.style.display = 'block';
            elements.resultUnreachableMsg.textContent = result.message || 'No directed path exists between seller and buyer.';
        }
    }

    // Side-by-Side Comparison for Viva Voce
    async function compareBothAlgorithms() {
        elements.btnCompareBoth.disabled = true;
        elements.btnCompareBoth.innerHTML = `<span>Running Both in C...</span>`;

        const src = state.selectedSource;
        const dst = state.selectedDestination;

        try {
            const [resD, resB] = await Promise.all([
                fetch('/api/route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ algorithm: 'dijkstra', source: src, destination: dst, graph: state.activeGraph })
                }),
                fetch('/api/route', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ algorithm: 'bellman-ford', source: src, destination: dst, graph: state.activeGraph })
                })
            ]);

            const dataD = await resD.json();
            const dataB = await resB.json();

            renderComparisonViva(dataD, dataB);
        } catch (e) {
            showToast(`Comparison Error: ${e.message}`, 'error');
        } finally {
            elements.btnCompareBoth.disabled = false;
            elements.btnCompareBoth.innerHTML = `
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
                    <line x1="8" y1="21" x2="16" y2="21"></line>
                    <line x1="12" y1="17" x2="12" y2="21"></line>
                </svg>
                <span>Compare Both Algorithms</span>
            `;
        }
    }

    function renderComparisonViva(d, b) {
        elements.comparisonVivaCard.style.display = 'block';

        elements.vivaDijkstraBody.innerHTML = `
            <div style="margin-bottom:0.4rem;"><strong>Status:</strong> <span class="badge ${d.status === 1 ? 'badge-emerald' : 'badge-amber'}">${d.status_text}</span></div>
            <div style="margin-bottom:0.35rem;"><strong>Net Cost:</strong> ${d.cost !== null ? d.cost + ' units' : 'N/A'}</div>
            <div style="margin-bottom:0.35rem;"><strong>Route:</strong> <code>${d.path.length ? d.path.join(' ➔ ') : 'None'}</code></div>
            <div><strong>C Time:</strong> <code>${d.execution_time_ms.toFixed(4)} ms</code></div>
            ${d.warning ? `<p class="text-amber" style="font-size:0.78rem;margin-top:0.4rem;">⚠️ ${d.warning}</p>` : ''}
        `;

        elements.vivaBellmanBody.innerHTML = `
            <div style="margin-bottom:0.4rem;"><strong>Status:</strong> <span class="badge ${b.status === 1 ? 'badge-emerald' : (b.status === -1 ? 'badge-rose' : 'badge-amber')}">${b.status_text}</span></div>
            <div style="margin-bottom:0.35rem;"><strong>Net Cost:</strong> ${b.cost !== null ? b.cost + ' units' : 'N/A'}</div>
            <div style="margin-bottom:0.35rem;"><strong>Route:</strong> <code>${b.path.length ? b.path.join(' ➔ ') : (b.cycle.length ? 'Cycle: ' + b.cycle.join(' ➔ ') : 'None')}</code></div>
            <div><strong>C Time:</strong> <code>${b.execution_time_ms.toFixed(4)} ms</code></div>
            ${b.warning ? `<p class="text-rose" style="font-size:0.78rem;margin-top:0.4rem;">⚠️ ${b.warning}</p>` : ''}
        `;

        let verdict = '';
        if (b.status === -1) {
            verdict = `<strong>Viva Finding:</strong> Bellman-Ford correctly intercepted an unbounded energy arbitrage loop. Dijkstra cannot detect negative cycles and would produce invalid routes.`;
        } else if (d.cost !== null && b.cost !== null && d.cost !== b.cost) {
            verdict = `<strong>Viva Finding (Dijkstra Greedy Failure Counterexample):</strong> With prosumer feed-in rebates, Dijkstra finalized suboptimal cost <strong>${d.cost} units</strong>, whereas Bellman-Ford found the true minimal cost of <strong>${b.cost} units</strong>.`;
        } else if (d.status === 1 && b.status === 1 && d.cost === b.cost) {
            verdict = `<strong>Viva Finding:</strong> Both algorithms agree on the optimal routing cost (<strong>${d.cost} units</strong>). Dijkstra's binary min-heap scales asymptotically superior at O((V+E) log V).`;
        } else {
            verdict = `<strong>Viva Finding:</strong> Both algorithms correctly determined unreachable substation topology without throwing errors.`;
        }
        elements.vivaVerdict.innerHTML = verdict;
    }

    // Benchmarks & Logarithmic Chart
    async function loadBenchmarks() {
        try {
            const res = await fetch('/api/benchmarks');
            if (res.ok) {
                const data = await res.json();
                state.benchmarkRows = data.rows || [];
                renderBenchmarkTable();
                drawBenchmarkChart();
                updateBenchmarkStats();
            }
        } catch (e) {
            console.warn('Could not load benchmarks', e);
        }
    }

    function updateBenchmarkStats() {
        const rows = state.benchmarkRows;
        if (!rows.length) return;

        const maxSpeedup = Math.max(...rows.map(r => r.speedup));
        const lastRow = rows[rows.length - 1];

        elements.statMaxSpeedup.textContent = `${maxSpeedup.toFixed(1)}x`;
        if (lastRow) {
            elements.statDijkstra10k.textContent = `${lastRow.dijkstra_ms.toFixed(2)} ms`;
            elements.statBf10k.textContent = `${lastRow.bellman_worst_ms.toFixed(2)} ms`;
        }
    }

    function renderBenchmarkTable() {
        elements.benchmarkTbody.innerHTML = '';
        state.benchmarkRows.forEach(row => {
            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><code>${row.vertices.toLocaleString()}</code></td>
                <td><code>${row.edges.toLocaleString()}</code></td>
                <td>${row.avg_degree.toFixed(1)}</td>
                <td>${row.topology}</td>
                <td><strong class="font-code text-cyan">${row.dijkstra_ms.toFixed(4)}</strong></td>
                <td><span class="font-code text-emerald">${row.bellman_early_ms.toFixed(4)}</span></td>
                <td><span class="font-code text-rose">${row.bellman_worst_ms.toFixed(4)}</span></td>
                <td><strong class="font-code text-emerald">${row.speedup.toFixed(1)}x</strong></td>
            `;
            elements.benchmarkTbody.appendChild(tr);
        });
    }

    function drawBenchmarkChart() {
        const rows = state.benchmarkRows;
        if (!rows.length) return;

        const canvas = elements.benchmarkChartCanvas;
        const w = canvas.width;
        const h = canvas.height;
        const c = chartCtx;

        c.clearRect(0, 0, w, h);

        const padding = { top: 30, right: 40, bottom: 50, left: 75 };
        const chartW = w - padding.left - padding.right;
        const chartH = h - padding.top - padding.bottom;

        const numPoints = rows.length;
        const getX = (i) => padding.left + (i * chartW) / (numPoints - 1);

        const minY = 0.001;
        const maxY = 1000.0;
        const logMin = Math.log10(minY);
        const logMax = Math.log10(maxY);

        const getY = (val) => {
            const v = Math.max(minY, Math.min(maxY, val));
            const logV = Math.log10(v);
            const ratio = (logV - logMin) / (logMax - logMin);
            return padding.top + chartH * (1 - ratio);
        };

        // Grid lines & Y Ticks
        c.strokeStyle = "rgba(255, 255, 255, 0.04)";
        c.lineWidth = 1;
        c.fillStyle = "#64748b";
        c.font = '10px JetBrains Mono';
        c.textAlign = 'right';

        const yTicks = [0.001, 0.01, 0.1, 1, 10, 100, 1000];
        yTicks.forEach(tick => {
            const y = getY(tick);
            c.beginPath();
            c.moveTo(padding.left, y);
            c.lineTo(padding.left + chartW, y);
            c.stroke();
            c.fillText(`${tick} ms`, padding.left - 10, y + 3);
        });

        // X Ticks
        c.textAlign = 'center';
        rows.forEach((r, i) => {
            const x = getX(i);
            c.beginPath();
            c.moveTo(x, padding.top);
            c.lineTo(x, padding.top + chartH);
            c.stroke();

            c.fillStyle = '#94a3b8';
            c.fillText(`V=${r.vertices >= 1000 ? (r.vertices / 1000) + 'k' : r.vertices}`, x, padding.top + chartH + 18);
            c.fillStyle = '#64748b';
            c.fillText(`E=${r.edges >= 1000 ? (r.edges / 1000) + 'k' : r.edges}`, x, padding.top + chartH + 32);
        });

        // Plot Series Lines
        plotSeries(c, rows, r => r.dijkstra_ms, getX, getY, '#38bdf8');
        plotSeries(c, rows, r => r.bellman_early_ms, getX, getY, '#34d399');
        plotSeries(c, rows, r => r.bellman_worst_ms, getX, getY, '#f43f5e');
    }

    function plotSeries(c, rows, valExtractor, getX, getY, color) {
        c.save();
        c.strokeStyle = color;
        c.lineWidth = 2.5;
        c.beginPath();

        rows.forEach((r, i) => {
            const x = getX(i);
            const y = getY(valExtractor(r));
            if (i === 0) c.moveTo(x, y);
            else c.lineTo(x, y);
        });
        c.stroke();

        rows.forEach((r, i) => {
            const x = getX(i);
            const y = getY(valExtractor(r));
            c.fillStyle = '#060910';
            c.strokeStyle = color;
            c.lineWidth = 2;
            c.beginPath();
            c.arc(x, y, 4, 0, 2 * Math.PI);
            c.fill();
            c.stroke();
        });

        c.restore();
    }

    async function rerunBenchmarkSuite() {
        elements.btnRerunBenchmark.disabled = true;
        elements.btnRerunBenchmark.innerHTML = `<span>Executing in C...</span>`;
        showToast('Running benchmark suite in GCC... (~3 seconds)');

        try {
            const res = await fetch('/api/run-benchmark', { method: 'POST' });
            if (!res.ok) throw new Error('Benchmark execution failed');
            const data = await res.json();
            if (data.success) {
                state.benchmarkRows = data.data.rows || [];
                renderBenchmarkTable();
                drawBenchmarkChart();
                updateBenchmarkStats();
                showToast('Benchmark suite re-executed in C and updated!');
            }
        } catch (e) {
            showToast(`Benchmark error: ${e.message}`, 'error');
        } finally {
            elements.btnRerunBenchmark.disabled = false;
            elements.btnRerunBenchmark.innerHTML = `
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M23 4v6h-6"></path>
                    <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"></path>
                </svg>
                <span>Re-run in C Engine</span>
            `;
        }
    }

    // Glass Toast Notification
    function showToast(msg, type = 'success') {
        elements.toast.textContent = msg;
        elements.toast.className = `glass-toast show ${type === 'error' ? 'toast-error' : 'toast-success'}`;
        clearTimeout(state.toastTimer);
        state.toastTimer = setTimeout(() => {
            elements.toast.className = 'glass-toast';
        }, 3200);
    }

    window.addEventListener('DOMContentLoaded', init);
})();
