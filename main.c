/* Least-Loss Energy Routing in a Microgrid */

#include <stdio.h>
#include <stdlib.h>
#include <stdbool.h>
#include <string.h>

#define INF 1000000000

typedef struct {
    int src;
    int dest;
    int weight;
} Edge;

typedef struct AdjListNode {
    int dest;
    int weight;
    struct AdjListNode* next;
} AdjListNode;

typedef struct {
    AdjListNode* head;
} AdjList;

typedef struct {
    int numVertices;
    int numEdges;
    int edgeCapacity;
    AdjList* adj;
    Edge* edges;
} Graph;

typedef struct {
    int v;
    int dist;
} MinHeapNode;

typedef struct {
    int size;
    int capacity;
    int* pos;
    MinHeapNode** array;
} MinHeap;

Graph* createGraph(int numVertices, int edgeCapacity) {
    Graph* graph = (Graph*)malloc(sizeof(Graph));
    graph->numVertices = numVertices;
    graph->numEdges = 0;
    graph->edgeCapacity = edgeCapacity > 0 ? edgeCapacity : 16;

    graph->adj = (AdjList*)malloc(numVertices * sizeof(AdjList));
    for (int i = 0; i < numVertices; i++) {
        graph->adj[i].head = NULL;
    }

    graph->edges = (Edge*)malloc(graph->edgeCapacity * sizeof(Edge));
    return graph;
}

void addEdge(Graph* graph, int src, int dest, int weight) {
    if (src < 0 || src >= graph->numVertices || dest < 0 || dest >= graph->numVertices) {
        printf("Error: Invalid edge (%d -> %d). Vertices must be between 0 and %d.\n",
               src, dest, graph->numVertices - 1);
        return;
    }

    AdjListNode* newNode = (AdjListNode*)malloc(sizeof(AdjListNode));
    newNode->dest = dest;
    newNode->weight = weight;
    newNode->next = graph->adj[src].head;
    graph->adj[src].head = newNode;

    if (graph->numEdges >= graph->edgeCapacity) {
        graph->edgeCapacity *= 2;
        graph->edges = (Edge*)realloc(graph->edges, graph->edgeCapacity * sizeof(Edge));
    }
    graph->edges[graph->numEdges].src = src;
    graph->edges[graph->numEdges].dest = dest;
    graph->edges[graph->numEdges].weight = weight;
    graph->numEdges++;
}

int hasNegativeEdge(Graph* graph) {
    for (int i = 0; i < graph->numEdges; i++) {
        if (graph->edges[i].weight < 0) {
            return 1;
        }
    }
    return 0;
}

void freeGraph(Graph* graph) {
    if (!graph) return;
    for (int i = 0; i < graph->numVertices; i++) {
        AdjListNode* curr = graph->adj[i].head;
        while (curr != NULL) {
            AdjListNode* temp = curr;
            curr = curr->next;
            free(temp);
        }
    }
    free(graph->adj);
    free(graph->edges);
    free(graph);
}

void printGraphSummary(Graph* graph) {
    printf("\n=== Microgrid Topology ===\n");
    printf("Total Nodes (Prosumers / Substations): %d\n", graph->numVertices);
    printf("Total Directed Transmission Lines: %d\n", graph->numEdges);
    printf("Line Details (Source -> Destination [Net Cost / Rebate]):\n");
    int limit = graph->numEdges > 50 ? 50 : graph->numEdges;
    for (int i = 0; i < limit; i++) {
        printf("  Node %d -> Node %d : %d units",
               graph->edges[i].src, graph->edges[i].dest, graph->edges[i].weight);
        if (graph->edges[i].weight < 0) {
            printf(" (Rebate / Incentive)");
        }
        printf("\n");
    }
    if (graph->numEdges > 50) {
        printf("  ... [showing first 50 of %d transmission lines]\n", graph->numEdges);
    }
    printf("==========================\n");
}


MinHeapNode* newMinHeapNode(int v, int dist) {
    MinHeapNode* minHeapNode = (MinHeapNode*)malloc(sizeof(MinHeapNode));
    minHeapNode->v = v;
    minHeapNode->dist = dist;
    return minHeapNode;
}

MinHeap* createMinHeap(int capacity) {
    MinHeap* minHeap = (MinHeap*)malloc(sizeof(MinHeap));
    minHeap->pos = (int*)malloc(capacity * sizeof(int));
    minHeap->size = 0;
    minHeap->capacity = capacity;
    minHeap->array = (MinHeapNode**)malloc(capacity * sizeof(MinHeapNode*));
    return minHeap;
}

void freeMinHeap(MinHeap* minHeap) {
    if (!minHeap) return;
    for (int i = 0; i < minHeap->size; i++) {
        free(minHeap->array[i]);
    }
    free(minHeap->array);
    free(minHeap->pos);
    free(minHeap);
}

void swapMinHeapNodes(MinHeap* minHeap, int i, int j) {
    minHeap->pos[minHeap->array[i]->v] = j;
    minHeap->pos[minHeap->array[j]->v] = i;

    MinHeapNode* temp = minHeap->array[i];
    minHeap->array[i] = minHeap->array[j];
    minHeap->array[j] = temp;
}

void minHeapify(MinHeap* minHeap, int idx) {
    int smallest = idx;
    int left = 2 * idx + 1;
    int right = 2 * idx + 2;

    if (left < minHeap->size && minHeap->array[left]->dist < minHeap->array[smallest]->dist) {
        smallest = left;
    }
    if (right < minHeap->size && minHeap->array[right]->dist < minHeap->array[smallest]->dist) {
        smallest = right;
    }

    if (smallest != idx) {
        swapMinHeapNodes(minHeap, idx, smallest);
        minHeapify(minHeap, smallest);
    }
}

int isEmpty(MinHeap* minHeap) {
    return minHeap->size == 0;
}

MinHeapNode* extractMin(MinHeap* minHeap) {
    if (isEmpty(minHeap)) return NULL;

    MinHeapNode* root = minHeap->array[0];
    MinHeapNode* lastNode = minHeap->array[minHeap->size - 1];

    minHeap->array[0] = lastNode;
    minHeap->pos[root->v] = minHeap->size - 1;
    minHeap->pos[lastNode->v] = 0;

    minHeap->size--;
    minHeapify(minHeap, 0);

    return root;
}

void decreaseKey(MinHeap* minHeap, int v, int dist) {
    int i = minHeap->pos[v];
    minHeap->array[i]->dist = dist;

    while (i > 0 && minHeap->array[i]->dist < minHeap->array[(i - 1) / 2]->dist) {
        swapMinHeapNodes(minHeap, i, (i - 1) / 2);
        i = (i - 1) / 2;
    }
}

int isInMinHeap(MinHeap* minHeap, int v) {
    return minHeap->pos[v] < minHeap->size;
}

void getPathArray(int parent[], int destination, int path[], int* pathLength, int maxNodes) {
    int curr = destination;
    int count = 0;
    while (curr != -1 && count < maxNodes) {
        path[count++] = curr;
        curr = parent[curr];
    }
    for (int i = 0; i < count / 2; i++) {
        int temp = path[i];
        path[i] = path[count - 1 - i];
        path[count - 1 - i] = temp;
    }
    *pathLength = count;
}

void printRoute(int parent[], int source, int destination, int numVertices) {
    if (source == destination) {
        printf("Node %d (Source is Destination)", source);
        return;
    }
    int* path = (int*)malloc((numVertices + 1) * sizeof(int));
    int pathLength = 0;
    getPathArray(parent, destination, path, &pathLength, numVertices + 1);

    for (int i = 0; i < pathLength; i++) {
        printf("Node %d", path[i]);
        if (i < pathLength - 1) {
            printf(" -> ");
        }
    }
    free(path);
}

int dijkstra(Graph* graph, int source, int destination, int dist[], int parent[]) {
    if (!graph || graph->numVertices <= 0 ||
        source < 0 || source >= graph->numVertices ||
        destination < 0 || destination >= graph->numVertices) {
        return 0;
    }

    int V = graph->numVertices;

    if (hasNegativeEdge(graph)) {
        printf("\n[WARNING: Dijkstra Pre-check]\n");
        printf("Graph contains negative edge weights (energy rebates).\n");
        printf("Standard Dijkstra assumes non-negative weights and may compute\n");
        printf("an incorrect path because finalized nodes are never revisited.\n");
    }

    MinHeap* minHeap = createMinHeap(V);

    for (int v = 0; v < V; v++) {
        dist[v] = INF;
        parent[v] = -1;
        minHeap->array[v] = newMinHeapNode(v, dist[v]);
        minHeap->pos[v] = v;
    }
    minHeap->size = V;

    dist[source] = 0;
    decreaseKey(minHeap, source, 0);

    while (!isEmpty(minHeap)) {
        MinHeapNode* minNode = extractMin(minHeap);
        int u = minNode->v;
        int uDist = minNode->dist;
        free(minNode);

        if (uDist == INF) {
            break;
        }

        AdjListNode* crawl = graph->adj[u].head;
        while (crawl != NULL) {
            int v = crawl->dest;
            int weight = crawl->weight;

            if (isInMinHeap(minHeap, v) && dist[u] + weight < dist[v]) {
                dist[v] = dist[u] + weight;
                parent[v] = u;
                decreaseKey(minHeap, v, dist[v]);
            }
            crawl = crawl->next;
        }
    }

    freeMinHeap(minHeap);

    if (dist[destination] >= INF / 2) {
        return 0;
    }
    return 1;
}

int bellmanFord(Graph* graph, int source, int destination, int dist[], int parent[], int* cycleNode) {
    if (!graph || graph->numVertices <= 0 ||
        source < 0 || source >= graph->numVertices ||
        destination < 0 || destination >= graph->numVertices) {
        if (cycleNode) *cycleNode = -1;
        return 0;
    }

    int V = graph->numVertices;
    int E = graph->numEdges;
    *cycleNode = -1;

    for (int i = 0; i < V; i++) {
        dist[i] = INF;
        parent[i] = -1;
    }
    dist[source] = 0;

    for (int i = 1; i <= V - 1; i++) {
        int relaxedAny = 0;
        for (int j = 0; j < E; j++) {
            int u = graph->edges[j].src;
            int v = graph->edges[j].dest;
            int w = graph->edges[j].weight;

            if (dist[u] < INF / 2 && dist[u] + w < dist[v]) {
                dist[v] = dist[u] + w;
                parent[v] = u;
                relaxedAny = 1;
            }
        }
        if (!relaxedAny) {
            break;
        }
    }

    for (int j = 0; j < E; j++) {
        int u = graph->edges[j].src;
        int v = graph->edges[j].dest;
        int w = graph->edges[j].weight;

        if (dist[u] < INF / 2 && dist[u] + w < dist[v]) {
            parent[v] = u;
            *cycleNode = v;
            return -1;
        }
    }

    if (dist[destination] >= INF / 2) {
        return 0;
    }
    return 1;
}

void printNegativeCycle(Graph* graph, int startNode, int parent[]) {
    int V = graph->numVertices;
    int curr = startNode;

    for (int i = 0; i < V; i++) {
        if (curr != -1 && parent[curr] != -1) {
            curr = parent[curr];
        }
    }

    int* cycle = (int*)malloc((V + 2) * sizeof(int));
    int count = 0;
    int cycleStart = curr;
    cycle[count++] = cycleStart;
    curr = parent[cycleStart];

    while (curr != cycleStart && count < V + 1 && curr != -1) {
        cycle[count++] = curr;
        curr = parent[curr];
    }

    if (curr == cycleStart && count > 1) {
        cycle[count++] = cycleStart;
        printf("Detected Arbitrage Loop (Reversed parent trace): ");
        for (int i = count - 1; i >= 0; i--) {
            printf("Node %d", cycle[i]);
            if (i > 0) printf(" -> ");
        }
        printf("\n");
    } else {
        printf("Arbitrage loop detected, but could not reconstruct full cycle loop.\n");
    }
    free(cycle);
}

void displayResult(const char* algoName, int source, int destination, int status, int dist[], int parent[], int cycleNode, Graph* graph) {
    printf("\n--------------------------------------------------\n");
    printf("Algorithm: %s\n", algoName);
    printf("Seller (Source Node): %d  -->  Buyer (Destination Node): %d\n", source, destination);

    if (status == -1) {
        printf("RESULT: [NEGATIVE-WEIGHT CYCLE DETECTED]\n");
        printf("Explanation: A directed transmission cycle with net negative loss/cost is reachable\n");
        printf("from source %d. In a microgrid, this represents an unbounded energy arbitrage loop\n", source);
        printf("(rebates exceed wheeling charges). By repeatedly routing energy through this cycle,\n");
        printf("the cost decreases infinitely to -infinity. Therefore, no finite shortest path exists.\n");
        if (cycleNode != -1 && parent != NULL) {
            printNegativeCycle(graph, cycleNode, parent);
        }
    } else if (status == 0) {
        printf("RESULT: [DESTINATION UNREACHABLE]\n");
        printf("Explanation: No valid directed transmission path exists from Node %d to Node %d.\n", source, destination);
        printf("Check microgrid switch connections and feeder line continuity.\n");
    } else {
        if (hasNegativeEdge(graph) && strcmp(algoName, "Bellman-Ford") != 0) {
            printf("RESULT: [SUBOPTIMAL / UNRELIABLE - DIJKSTRA DOES NOT SUPPORT NEGATIVE WEIGHTS]\n");
            printf("Computed Net Cost / Loss: %d units (Not guaranteed to be minimal!)\n", dist[destination]);
            printf("Computed Routing Path: ");
            printRoute(parent, source, destination, graph->numVertices);
            printf("\n");
            printf("Warning: Graph contains negative rebate lines. Dijkstra's greedy choice\n");
            printf("permanently finalizes nodes, causing it to miss lower-cost paths.\n");
            printf("Use Bellman-Ford for guaranteed shortest paths with negative weights.\n");
        } else {
            printf("RESULT: [SUCCESSFUL MINIMUM-COST ROUTE FOUND]\n");
            printf("Minimum Net Transfer Cost / Loss: %d units\n", dist[destination]);
            printf("Optimal Routing Path: ");
            printRoute(parent, source, destination, graph->numVertices);
            printf("\n");
        }
    }
    printf("--------------------------------------------------\n");
}

/* Demo 1 */
void runDemo1() {
    printf("\n======================================================================\n");
    printf("DEMONSTRATION 1: Dijkstra Failure vs Bellman-Ford on Negative Edge\n");
    printf("======================================================================\n");
    printf("Microgrid Context:\n");
    printf("  Node 0: Solar Farm (Seller / Source)\n");
    printf("  Node 1: Battery Energy Storage System (Substation)\n");
    printf("  Node 2: Industrial Consumer (Buyer / Destination)\n");
    printf("Transmission lines:\n");
    printf("  0 -> 1 : +5 units (Standard transmission loss)\n");
    printf("  0 -> 2 : +4 units (Direct high-loss line)\n");
    printf("  1 -> 2 : -3 units (Green energy feed-in rebate from battery)\n");
    printf("\nPath Options:\n");
    printf("  Path A (Direct): 0 -> 2, Net Cost = 4\n");
    printf("  Path B (Via Battery): 0 -> 1 -> 2, Net Cost = 5 + (-3) = 2\n");
    printf("  Theoretical Minimum Cost Route: 0 -> 1 -> 2 (Cost = 2)\n\n");

    Graph* g = createGraph(3, 4);
    addEdge(g, 0, 1, 5);
    addEdge(g, 0, 2, 4);
    addEdge(g, 1, 2, -3);

    int distD[3], parentD[3];
    int statusD = dijkstra(g, 0, 2, distD, parentD);
    displayResult("Dijkstra (Binary Min-Heap)", 0, 2, statusD, distD, parentD, -1, g);

    int distB[3], parentB[3], cycleNode = -1;
    int statusB = bellmanFord(g, 0, 2, distB, parentB, &cycleNode);
    displayResult("Bellman-Ford", 0, 2, statusB, distB, parentB, cycleNode, g);

    printf("\n[Viva Analysis of Demo 1]\n");
    printf("Why did Dijkstra fail?\n");
    printf("1. At step 1, Dijkstra relaxes from 0: dist[1] = 5, dist[2] = 4.\n");
    printf("2. Greedy choice: Node 2 has smaller distance (4 < 5), so it extracts Node 2.\n");
    printf("3. Dijkstra marks Node 2 as finalized/settled with cost 4.\n");
    printf("4. Next, it extracts Node 1 (dist 5). Even though line 1 -> 2 has weight -3\n");
    printf("   which would reduce dist[2] to 5 + (-3) = 2, Node 2 is already extracted\n");
    printf("   and cannot be updated. Thus Dijkstra reports wrong cost: 4 instead of 2.\n");
    printf("5. Bellman-Ford relaxes all edges systematically and correctly discovers\n");
    printf("   the lower-cost path: 0 -> 1 -> 2 with cost 2.\n");

    freeGraph(g);
}

/* Demo 2 */
void runDemo2() {
    printf("\n======================================================================\n");
    printf("DEMONSTRATION 2: Standard Graph with Only Non-Negative Edges\n");
    printf("======================================================================\n");
    printf("Microgrid Context: 4 distribution nodes with wheeling loss penalties.\n");

    Graph* g = createGraph(4, 5);
    addEdge(g, 0, 1, 4);
    addEdge(g, 0, 2, 2);
    addEdge(g, 2, 1, 1);
    addEdge(g, 1, 3, 5);
    addEdge(g, 2, 3, 8);

    printGraphSummary(g);

    int distD[4], parentD[4];
    int statusD = dijkstra(g, 0, 3, distD, parentD);
    displayResult("Dijkstra (Binary Min-Heap)", 0, 3, statusD, distD, parentD, -1, g);

    int distB[4], parentB[4], cycleNode = -1;
    int statusB = bellmanFord(g, 0, 3, distB, parentB, &cycleNode);
    displayResult("Bellman-Ford", 0, 3, statusB, distB, parentB, cycleNode, g);

    printf("Observation: Both algorithms agree on optimal path 0 -> 2 -> 1 -> 3 with cost 8.\n");
    freeGraph(g);
}

/* Demo 3 */
void runDemo3() {
    printf("\n======================================================================\n");
    printf("DEMONSTRATION 3: Graph with Negative Rebate Edge but No Negative Cycle\n");
    printf("======================================================================\n");

    Graph* g = createGraph(4, 5);
    addEdge(g, 0, 1, 6);
    addEdge(g, 0, 2, 7);
    addEdge(g, 1, 2, 8);
    addEdge(g, 1, 3, -4);
    addEdge(g, 2, 3, 9);

    printGraphSummary(g);

    int distB[4], parentB[4], cycleNode = -1;
    int statusB = bellmanFord(g, 0, 3, distB, parentB, &cycleNode);
    displayResult("Bellman-Ford", 0, 3, statusB, distB, parentB, cycleNode, g);

    printf("Observation: Bellman-Ford safely finds route 0 -> 1 -> 3 with net cost 2.\n");
    freeGraph(g);
}

/* Demo 4 */
void runDemo4() {
    printf("\n======================================================================\n");
    printf("DEMONSTRATION 4: Graph with Reachable Negative Arbitrage Cycle\n");
    printf("======================================================================\n");

    Graph* g = createGraph(3, 3);
    addEdge(g, 0, 1, 3);
    addEdge(g, 1, 2, 2);
    addEdge(g, 2, 1, -4);

    printGraphSummary(g);

    int distB[3], parentB[3], cycleNode = -1;
    int statusB = bellmanFord(g, 0, 2, distB, parentB, &cycleNode);
    displayResult("Bellman-Ford", 0, 2, statusB, distB, parentB, cycleNode, g);

    freeGraph(g);
}

/* Demo 5 */
void runDemo5() {
    printf("\n======================================================================\n");
    printf("DEMONSTRATION 5: Destination Cannot Be Reached\n");
    printf("======================================================================\n");

    Graph* g = createGraph(3, 1);
    addEdge(g, 0, 1, 5);

    printGraphSummary(g);

    int distD[3], parentD[3];
    int statusD = dijkstra(g, 0, 2, distD, parentD);
    displayResult("Dijkstra (Binary Min-Heap)", 0, 2, statusD, distD, parentD, -1, g);

    int distB[3], parentB[3], cycleNode = -1;
    int statusB = bellmanFord(g, 0, 2, distB, parentB, &cycleNode);
    displayResult("Bellman-Ford", 0, 2, statusB, distB, parentB, cycleNode, g);

    freeGraph(g);
}

/* Demo 6 */
void runDemo6() {
    printf("\n======================================================================\n");
    printf("DEMONSTRATION 6: Source and Destination Are the Same Node\n");
    printf("======================================================================\n");

    Graph* g = createGraph(3, 2);
    addEdge(g, 0, 1, 4);
    addEdge(g, 1, 2, 3);

    printGraphSummary(g);

    int distD[3], parentD[3];
    int statusD = dijkstra(g, 1, 1, distD, parentD);
    displayResult("Dijkstra (Binary Min-Heap)", 1, 1, statusD, distD, parentD, -1, g);

    int distB[3], parentB[3], cycleNode = -1;
    int statusB = bellmanFord(g, 1, 1, distB, parentB, &cycleNode);
    displayResult("Bellman-Ford", 1, 1, statusB, distB, parentB, cycleNode, g);

    freeGraph(g);
}

void runAllDemonstrations() {
    runDemo1();
    runDemo2();
    runDemo3();
    runDemo4();
    runDemo5();
    runDemo6();
}

void runAutomatedTests() {
    printf("\n==================================================\n");
    printf("   RUNNING AUTOMATED UNIT CORRECTNESS TESTS       \n");
    printf("==================================================\n");
    int passed = 0;
    int total = 6;

    /* Test 1 */
    {
        Graph* g = createGraph(3, 3);
        addEdge(g, 0, 1, 5);
        addEdge(g, 0, 2, 4);
        addEdge(g, 1, 2, -3);

        int distD[3], parentD[3];
        dijkstra(g, 0, 2, distD, parentD);

        int distB[3], parentB[3], cycleNode = -1;
        bellmanFord(g, 0, 2, distB, parentB, &cycleNode);

        if (distD[2] == 4 && distB[2] == 2) {
            printf("[PASS] Test 1: Counterexample verified (Dijkstra=4, Bellman-Ford=2)\n");
            passed++;
        } else {
            printf("[FAIL] Test 1: Counterexample failed\n");
        }
        freeGraph(g);
    }

    /* Test 2 */
    {
        Graph* g = createGraph(4, 5);
        addEdge(g, 0, 1, 4);
        addEdge(g, 0, 2, 2);
        addEdge(g, 2, 1, 1);
        addEdge(g, 1, 3, 5);
        addEdge(g, 2, 3, 8);

        int distD[4], parentD[4];
        dijkstra(g, 0, 3, distD, parentD);

        int distB[4], parentB[4], cycleNode = -1;
        bellmanFord(g, 0, 3, distB, parentB, &cycleNode);

        if (distD[3] == 8 && distB[3] == 8) {
            printf("[PASS] Test 2: Non-negative graph yields cost 8 in both algorithms\n");
            passed++;
        } else {
            printf("[FAIL] Test 2: Non-negative graph test failed\n");
        }
        freeGraph(g);
    }

    /* Test 3 */
    {
        Graph* g = createGraph(4, 5);
        addEdge(g, 0, 1, 6);
        addEdge(g, 0, 2, 7);
        addEdge(g, 1, 2, 8);
        addEdge(g, 1, 3, -4);
        addEdge(g, 2, 3, 9);

        int distB[4], parentB[4], cycleNode = -1;
        int status = bellmanFord(g, 0, 3, distB, parentB, &cycleNode);

        if (status == 1 && distB[3] == 2) {
            printf("[PASS] Test 3: Negative edge handled correctly (cost = 2)\n");
            passed++;
        } else {
            printf("[FAIL] Test 3: Negative edge test failed\n");
        }
        freeGraph(g);
    }

    /* Test 4 */
    {
        Graph* g = createGraph(3, 3);
        addEdge(g, 0, 1, 3);
        addEdge(g, 1, 2, 2);
        addEdge(g, 2, 1, -4);

        int distB[3], parentB[3], cycleNode = -1;
        int status = bellmanFord(g, 0, 2, distB, parentB, &cycleNode);

        if (status == -1) {
            printf("[PASS] Test 4: Reachable negative cycle detected (-1 returned)\n");
            passed++;
        } else {
            printf("[FAIL] Test 4: Negative cycle detection failed\n");
        }
        freeGraph(g);
    }

    /* Test 5 */
    {
        Graph* g = createGraph(3, 1);
        addEdge(g, 0, 1, 5);

        int distD[3], parentD[3];
        int statusD = dijkstra(g, 0, 2, distD, parentD);

        int distB[3], parentB[3], cycleNode = -1;
        int statusB = bellmanFord(g, 0, 2, distB, parentB, &cycleNode);

        if (statusD == 0 && statusB == 0) {
            printf("[PASS] Test 5: Unreachable destination correctly flagged by both\n");
            passed++;
        } else {
            printf("[FAIL] Test 5: Unreachable destination test failed\n");
        }
        freeGraph(g);
    }

    /* Test 6 */
    {
        Graph* g = createGraph(3, 2);
        addEdge(g, 0, 1, 4);
        addEdge(g, 1, 2, 3);

        int distD[3], parentD[3];
        int statusD = dijkstra(g, 1, 1, distD, parentD);

        int distB[3], parentB[3], cycleNode = -1;
        int statusB = bellmanFord(g, 1, 1, distB, parentB, &cycleNode);

        if (statusD == 1 && distD[1] == 0 && statusB == 1 && distB[1] == 0) {
            printf("[PASS] Test 6: Source == Destination handled (cost = 0)\n");
            passed++;
        } else {
            printf("[FAIL] Test 6: Same source/dest test failed\n");
        }
        freeGraph(g);
    }

    printf("--------------------------------------------------\n");
    printf("Result: %d / %d Tests Passed.\n", passed, total);
    if (passed == total) {
        printf("All required algorithm behaviors are fully verified!\n");
    }
    printf("==================================================\n");
}

Graph* loadGraphFromFile(const char* filename) {
    FILE* file = fopen(filename, "r");
    if (!file) {
        printf("Error: Could not open file '%s'.\n", filename);
        return NULL;
    }

    int V, E;
    if (fscanf(file, "%d %d", &V, &E) != 2 || V <= 0 || E < 0) {
        printf("Error: Invalid file header format. Expected positive V and non-negative E.\n");
        fclose(file);
        return NULL;
    }

    Graph* g = createGraph(V, E);
    for (int i = 0; i < E; i++) {
        int u, v, w;
        if (fscanf(file, "%d %d %d", &u, &v, &w) != 3) {
            printf("Error reading line %d from file.\n", i + 1);
            freeGraph(g);
            fclose(file);
            return NULL;
        }
        if (u < 0 || u >= V || v < 0 || v >= V) {
            printf("Error: Line %d has invalid node index (%d -> %d). Allowed range: 0 to %d.\n",
                   i + 1, u, v, V - 1);
            freeGraph(g);
            fclose(file);
            return NULL;
        }
        addEdge(g, u, v, w);
    }

    fclose(file);
    printf("Successfully loaded microgrid graph with %d nodes and %d transmission lines from '%s'.\n", V, E, filename);
    return g;
}

Graph* inputCustomGraph() {
    int V, E;
    printf("\n--- Manual Microgrid Topology Input ---\n");
    printf("Enter number of nodes (prosumers/substations): ");
    if (scanf("%d", &V) != 1 || V <= 0) {
        int c; while ((c = getchar()) != '\n' && c != EOF);
        printf("Invalid number of vertices (must be > 0).\n");
        return NULL;
    }

    printf("Enter number of transmission lines: ");
    if (scanf("%d", &E) != 1 || E < 0) {
        int c; while ((c = getchar()) != '\n' && c != EOF);
        printf("Invalid number of edges (must be >= 0).\n");
        return NULL;
    }

    Graph* g = createGraph(V, E);
    printf("Enter %d lines in format: <src> <dest> <weight>\n", E);
    printf("(Tip: Weights can be positive for loss/fee, or negative for green rebate):\n");

    for (int i = 0; i < E; i++) {
        int u, v, w;
        printf("  Line %d: ", i + 1);
        if (scanf("%d %d %d", &u, &v, &w) != 3) {
            int c; while ((c = getchar()) != '\n' && c != EOF);
            printf("Invalid input. Aborting.\n");
            freeGraph(g);
            return NULL;
        }
        if (u < 0 || u >= V || v < 0 || v >= V) {
            printf("Invalid node index. Allowed range: 0 to %d. Aborting.\n", V - 1);
            freeGraph(g);
            return NULL;
        }
        addEdge(g, u, v, w);
    }
    return g;
}

int main(int argc, char* argv[]) {
    if (argc > 1 && strcmp(argv[1], "--test") == 0) {
        runAutomatedTests();
        return 0;
    }

    if (argc > 1 && strcmp(argv[1], "--demo") == 0) {
        runAllDemonstrations();
        return 0;
    }

    printf("===================================================================\n");
    printf("   LEAST-LOSS ENERGY ROUTING IN A MICROGRID (DAA PROJECT)          \n");
    printf("===================================================================\n");
    printf("Department of Computer Science & Engineering - B.Tech (Year 2)    \n");

    Graph* activeGraph = createGraph(4, 5);
    addEdge(activeGraph, 0, 1, 4);
    addEdge(activeGraph, 0, 2, 2);
    addEdge(activeGraph, 2, 1, 1);
    addEdge(activeGraph, 1, 3, 5);
    addEdge(activeGraph, 2, 3, 8);

    int choice = 0;
    while (1) {
        printf("\n==================== MAIN MENU ====================\n");
        printf("1. View Current Microgrid Topology\n");
        printf("2. Run Dijkstra's Algorithm (Binary Min-Heap)\n");
        printf("3. Run Bellman-Ford's Algorithm (with Negative Cycle Check)\n");
        printf("4. Compare Dijkstra vs Bellman-Ford on Current Graph\n");
        printf("5. Run Demonstration 1: Negative-Weight Counterexample\n");
        printf("6. Run All 6 Faculty-Required Demonstrations\n");
        printf("7. Run Automated Correctness Unit Tests\n");
        printf("8. Load Microgrid Topology from File\n");
        printf("9. Enter Custom Microgrid Topology Manually\n");
        printf("0. Exit\n");
        printf("Enter your choice (0-9): ");

        if (scanf("%d", &choice) != 1) {
            int c;
            while ((c = getchar()) != '\n' && c != EOF);
            printf("Invalid input. Please enter a number between 0 and 9.\n");
            continue;
        }

        if (choice == 0) {
            printf("\nExiting Microgrid Energy Routing System. Goodbye!\n");
            break;
        }

        switch (choice) {
            case 1:
                printGraphSummary(activeGraph);
                break;

            case 2: {
                if (hasNegativeEdge(activeGraph)) {
                    printf("\n[Notice: Current graph has negative rebate edges.]\n");
                    printf("[Dijkstra cannot guarantee finding optimal paths with negative weights.]\n");
                    printf("[Running Dijkstra for educational comparison / analysis only.]\n");
                }
                int src, dest;
                printf("Enter Seller (Source Node 0 to %d): ", activeGraph->numVertices - 1);
                if (scanf("%d", &src) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Error: Invalid numeric input.\n");
                    break;
                }
                printf("Enter Buyer (Destination Node 0 to %d): ", activeGraph->numVertices - 1);
                if (scanf("%d", &dest) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Error: Invalid numeric input.\n");
                    break;
                }

                if (src < 0 || src >= activeGraph->numVertices || dest < 0 || dest >= activeGraph->numVertices) {
                    printf("Error: Node indices out of bounds (allowed: 0 to %d).\n", activeGraph->numVertices - 1);
                    break;
                }

                int* dist = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int* parent = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int status = dijkstra(activeGraph, src, dest, dist, parent);
                displayResult("Dijkstra (Binary Min-Heap)", src, dest, status, dist, parent, -1, activeGraph);
                free(dist);
                free(parent);
                break;
            }

            case 3: {
                int src, dest;
                printf("Enter Seller (Source Node 0 to %d): ", activeGraph->numVertices - 1);
                if (scanf("%d", &src) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Error: Invalid numeric input.\n");
                    break;
                }
                printf("Enter Buyer (Destination Node 0 to %d): ", activeGraph->numVertices - 1);
                if (scanf("%d", &dest) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Error: Invalid numeric input.\n");
                    break;
                }

                if (src < 0 || src >= activeGraph->numVertices || dest < 0 || dest >= activeGraph->numVertices) {
                    printf("Error: Node indices out of bounds (allowed: 0 to %d).\n", activeGraph->numVertices - 1);
                    break;
                }

                int* dist = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int* parent = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int cycleNode = -1;
                int status = bellmanFord(activeGraph, src, dest, dist, parent, &cycleNode);
                displayResult("Bellman-Ford", src, dest, status, dist, parent, cycleNode, activeGraph);
                free(dist);
                free(parent);
                break;
            }

            case 4: {
                int src, dest;
                printf("Enter Seller (Source Node 0 to %d): ", activeGraph->numVertices - 1);
                if (scanf("%d", &src) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Error: Invalid numeric input.\n");
                    break;
                }
                printf("Enter Buyer (Destination Node 0 to %d): ", activeGraph->numVertices - 1);
                if (scanf("%d", &dest) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Error: Invalid numeric input.\n");
                    break;
                }

                if (src < 0 || src >= activeGraph->numVertices || dest < 0 || dest >= activeGraph->numVertices) {
                    printf("Error: Node indices out of bounds (allowed: 0 to %d).\n", activeGraph->numVertices - 1);
                    break;
                }

                int* distD = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int* parentD = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int statusD = dijkstra(activeGraph, src, dest, distD, parentD);
                displayResult("Dijkstra (Binary Min-Heap)", src, dest, statusD, distD, parentD, -1, activeGraph);

                int* distB = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int* parentB = (int*)malloc(activeGraph->numVertices * sizeof(int));
                int cycleNode = -1;
                int statusB = bellmanFord(activeGraph, src, dest, distB, parentB, &cycleNode);
                displayResult("Bellman-Ford", src, dest, statusB, distB, parentB, cycleNode, activeGraph);

                printf("\n--- Direct Comparison ---\n");
                if (statusB == -1) {
                    printf("Bellman-Ford detected an arbitrage loop (negative cycle).\n");
                    printf("Dijkstra cannot detect negative cycles and its output is invalid.\n");
                } else if (statusB == 0) {
                    printf("Both algorithms confirmed destination is unreachable.\n");
                } else {
                    printf("Dijkstra Computed Cost:     %d\n", distD[dest]);
                    printf("Bellman-Ford Computed Cost: %d\n", distB[dest]);
                    if (hasNegativeEdge(activeGraph)) {
                        if (distD[dest] == distB[dest]) {
                            printf("Notice: Both returned identical cost on this instance, but Dijkstra cannot\n");
                            printf("guarantee correctness when negative edges are present.\n");
                        } else {
                            printf("Discrepancy: Dijkstra gave suboptimal/incorrect cost due to negative edge!\n");
                            printf("Bellman-Ford found the true minimal-loss route.\n");
                        }
                    } else {
                        if (distD[dest] == distB[dest]) {
                            printf("Agreement: Both algorithms produced identical optimal cost.\n");
                        }
                    }
                }
                free(distD);
                free(parentD);
                free(distB);
                free(parentB);
                break;
            }

            case 5:
                runDemo1();
                break;

            case 6:
                runAllDemonstrations();
                break;

            case 7:
                runAutomatedTests();
                break;

            case 8: {
                char filename[256];
                printf("Enter filename to load (e.g., sample_microgrid.txt): ");
                if (scanf("%255s", filename) != 1) {
                    int c; while ((c = getchar()) != '\n' && c != EOF);
                    printf("Invalid filename.\n");
                    break;
                }
                Graph* newG = loadGraphFromFile(filename);
                if (newG) {
                    freeGraph(activeGraph);
                    activeGraph = newG;
                }
                break;
            }

            case 9: {
                Graph* newG = inputCustomGraph();
                if (newG) {
                    freeGraph(activeGraph);
                    activeGraph = newG;
                    printf("New microgrid topology loaded successfully!\n");
                }
                break;
            }

            default:
                printf("Invalid selection. Please choose an option from 0 to 9.\n");
                break;
        }
    }

    freeGraph(activeGraph);
    return 0;
}
