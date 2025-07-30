// New Block - Updated July 30, 2025
function noop() { }
function run(fn) {
    return fn();
}
function blank_object() {
    return Object.create(null);
}
function run_all(fns) {
    fns.forEach(run);
}
function is_function(thing) {
    return typeof thing === 'function';
}
function safe_not_equal(a, b) {
    return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function action_destroyer(action_result) {
    return action_result && is_function(action_result.destroy) ? action_result.destroy : noop;
}

// Track which nodes are claimed during hydration. Unclaimed nodes can then be removed from the DOM
// at the end of hydration without touching the remaining nodes.
let is_hydrating = false;
function start_hydrating() {
    is_hydrating = true;
}
function end_hydrating() {
    is_hydrating = false;
}
function upper_bound(low, high, key, value) {
    // Return first index of value larger than input value in the range [low, high)
    while (low < high) {
        const mid = low + ((high - low) >> 1);
        if (key(mid) <= value) {
            low = mid + 1;
        }
        else {
            high = mid;
        }
    }
    return low;
}
function init_hydrate(target) {
    if (target.hydrate_init)
        return;
    target.hydrate_init = true;
    // We know that all children have claim_order values since the unclaimed have been detached if target is not <head>
    let children = target.childNodes;
    // If target is <head>, there may be children without claim_order
    if (target.nodeName === 'HEAD') {
        const myChildren = [];
        for (let i = 0; i < children.length; i++) {
            const node = children[i];
            if (node.claim_order !== undefined) {
                myChildren.push(node);
            }
        }
        children = myChildren;
    }
    /*
    * Reorder claimed children optimally.
    * We can reorder claimed children optimally by finding the longest subsequence of
    * nodes that are already claimed in order and only moving the rest. The longest
    * subsequence of nodes that are claimed in order can be found by
    * computing the longest increasing subsequence of .claim_order values.
    *
    * This algorithm is optimal in generating the least amount of reorder operations
    * possible.
    *
    * Proof:
    * We know that, given a set of reordering operations, the nodes that do not move
    * always form an increasing subsequence, since they do not move among each other
    * meaning that they must be already ordered among each other. Thus, the maximal
    * set of nodes that do not move form a longest increasing subsequence.
    */
    // Compute longest increasing subsequence
    // m: subsequence length j => index k of smallest value that ends an increasing subsequence of length j
    const m = new Int32Array(children.length + 1);
    // Predecessor indices + 1
    const p = new Int32Array(children.length);
    m[0] = -1;
    let longest = 0;
    for (let i = 0; i < children.length; i++) {
        const current = children[i].claim_order;
        // Find the largest subsequence length such that it ends in a value less than our current value
        // upper_bound returns first greater value, so we subtract one
        // with fast path for when we are on the current longest subsequence
        const seqLen = ((longest > 0 && children[m[longest]].claim_order <= current) ? longest + 1 : upper_bound(1, longest, idx => children[m[idx]].claim_order, current)) - 1;
        p[i] = m[seqLen] + 1;
        const newLen = seqLen + 1;
        // We can guarantee that current is the smallest value. Otherwise, we would have generated a longer sequence.
        m[newLen] = i;
        longest = Math.max(newLen, longest);
    }
    // The longest increasing subsequence of nodes (initially reversed)
    const lis = [];
    // The rest of the nodes, nodes that will be moved
    const toMove = [];
    let last = children.length - 1;
    for (let cur = m[longest] + 1; cur != 0; cur = p[cur - 1]) {
        lis.push(children[cur - 1]);
        for (; last >= cur; last--) {
            toMove.push(children[last]);
        }
        last--;
    }
    for (; last >= 0; last--) {
        toMove.push(children[last]);
    }
    lis.reverse();
    // We sort the nodes being moved to guarantee that their insertion order matches the claim order
    toMove.sort((a, b) => a.claim_order - b.claim_order);
    // Finally, we move the nodes
    for (let i = 0, j = 0; i < toMove.length; i++) {
        while (j < lis.length && toMove[i].claim_order >= lis[j].claim_order) {
            j++;
        }
        const anchor = j < lis.length ? lis[j] : null;
        target.insertBefore(toMove[i], anchor);
    }
}
function append_hydration(target, node) {
    if (is_hydrating) {
        init_hydrate(target);
        if ((target.actual_end_child === undefined) || ((target.actual_end_child !== null) && (target.actual_end_child.parentNode !== target))) {
            target.actual_end_child = target.firstChild;
        }
        // Skip nodes of undefined ordering
        while ((target.actual_end_child !== null) && (target.actual_end_child.claim_order === undefined)) {
            target.actual_end_child = target.actual_end_child.nextSibling;
        }
        if (node !== target.actual_end_child) {
            // We only insert if the ordering of this node should be modified or the parent node is not target
            if (node.claim_order !== undefined || node.parentNode !== target) {
                target.insertBefore(node, target.actual_end_child);
            }
        }
        else {
            target.actual_end_child = node.nextSibling;
        }
    }
    else if (node.parentNode !== target || node.nextSibling !== null) {
        target.appendChild(node);
    }
}
function insert_hydration(target, node, anchor) {
    if (is_hydrating && !anchor) {
        append_hydration(target, node);
    }
    else if (node.parentNode !== target || node.nextSibling != anchor) {
        target.insertBefore(node, anchor || null);
    }
}
function detach(node) {
    if (node.parentNode) {
        node.parentNode.removeChild(node);
    }
}
function destroy_each(iterations, detaching) {
    for (let i = 0; i < iterations.length; i += 1) {
        if (iterations[i])
            iterations[i].d(detaching);
    }
}
function element(name) {
    return document.createElement(name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function listen(node, event, handler, options) {
    node.addEventListener(event, handler, options);
    return () => node.removeEventListener(event, handler, options);
}
function attr(node, attribute, value) {
    if (value == null)
        node.removeAttribute(attribute);
    else if (node.getAttribute(attribute) !== value)
        node.setAttribute(attribute, value);
}
function children(element) {
    return Array.from(element.childNodes);
}
function init_claim_info(nodes) {
    if (nodes.claim_info === undefined) {
        nodes.claim_info = { last_index: 0, total_claimed: 0 };
    }
}
function claim_node(nodes, predicate, processNode, createNode, dontUpdateLastIndex = false) {
    // Try to find nodes in an order such that we lengthen the longest increasing subsequence
    init_claim_info(nodes);
    const resultNode = (() => {
        // We first try to find an element after the previous one
        for (let i = nodes.claim_info.last_index; i < nodes.length; i++) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                return node;
            }
        }
        // Otherwise, we try to find one before
        // We iterate in reverse so that we don't go too far back
        for (let i = nodes.claim_info.last_index - 1; i >= 0; i--) {
            const node = nodes[i];
            if (predicate(node)) {
                const replacement = processNode(node);
                if (replacement === undefined) {
                    nodes.splice(i, 1);
                }
                else {
                    nodes[i] = replacement;
                }
                if (!dontUpdateLastIndex) {
                    nodes.claim_info.last_index = i;
                }
                else if (replacement === undefined) {
                    // Since we spliced before the last_index, we decrease it
                    nodes.claim_info.last_index--;
                }
                return node;
            }
        }
        // If we can't find any matching node, we create a new one
        return createNode();
    })();
    resultNode.claim_order = nodes.claim_info.total_claimed;
    nodes.claim_info.total_claimed += 1;
    return resultNode;
}
function claim_element_base(nodes, name, attributes, create_element) {
    return claim_node(nodes, (node) => node.nodeName === name, (node) => {
        const remove = [];
        for (let j = 0; j < node.attributes.length; j++) {
            const attribute = node.attributes[j];
            if (!attributes[attribute.name]) {
                remove.push(attribute.name);
            }
        }
        remove.forEach(v => node.removeAttribute(v));
        return undefined;
    }, () => create_element(name));
}
function claim_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, element);
}
function claim_text(nodes, data) {
    return claim_node(nodes, (node) => node.nodeType === 3, (node) => {
        const dataStr = '' + data;
        if (node.data.startsWith(dataStr)) {
            if (node.data.length !== dataStr.length) {
                return node.splitText(dataStr.length);
            }
        }
        else {
            node.data = dataStr;
        }
    }, () => text(data), true // Text nodes should not update last index since it is likely not worth it to eliminate an increasing subsequence of actual elements
    );
}
function claim_space(nodes) {
    return claim_text(nodes, ' ');
}
function set_data(text, data) {
    data = '' + data;
    if (text.data === data)
        return;
    text.data = data;
}
function set_input_value(input, value) {
    input.value = value == null ? '' : value;
}

let current_component;
function set_current_component(component) {
    current_component = component;
}

const dirty_components = [];
const binding_callbacks = [];
let render_callbacks = [];
const flush_callbacks = [];
const resolved_promise = /* @__PURE__ */ Promise.resolve();
let update_scheduled = false;
function schedule_update() {
    if (!update_scheduled) {
        update_scheduled = true;
        resolved_promise.then(flush);
    }
}
function add_render_callback(fn) {
    render_callbacks.push(fn);
}
// flush() calls callbacks in this order:
// 1. All beforeUpdate callbacks, in order: parents before children
// 2. All bind:this callbacks, in reverse order: children before parents.
// 3. All afterUpdate callbacks, in order: parents before children. EXCEPT
//    for afterUpdates called during the initial onMount, which are called in
//    reverse order: children before parents.
// Since callbacks might update component values, which could trigger another
// call to flush(), the following steps guard against this:
// 1. During beforeUpdate, any updated components will be added to the
//    dirty_components array and will cause a reentrant call to flush(). Because
//    the flush index is kept outside the function, the reentrant call will pick
//    up where the earlier call left off and go through all dirty components. The
//    current_component value is saved and restored so that the reentrant call will
//    not interfere with the "parent" flush() call.
// 2. bind:this callbacks cannot trigger new flush() calls.
// 3. During afterUpdate, any updated components will NOT have their afterUpdate
//    callback called a second time; the seen_callbacks set, outside the flush()
//    function, guarantees this behavior.
const seen_callbacks = new Set();
let flushidx = 0; // Do *not* move this inside the flush() function
function flush() {
    // Do not reenter flush while dirty components are updated, as this can
    // result in an infinite loop. Instead, let the inner flush handle it.
    // Reentrancy is ok afterwards for bindings etc.
    if (flushidx !== 0) {
        return;
    }
    const saved_component = current_component;
    do {
        // first, call beforeUpdate functions
        // and update components
        try {
            while (flushidx < dirty_components.length) {
                const component = dirty_components[flushidx];
                flushidx++;
                set_current_component(component);
                update(component.$$);
            }
        }
        catch (e) {
            // reset dirty state to not end up in a deadlocked state and then rethrow
            dirty_components.length = 0;
            flushidx = 0;
            throw e;
        }
        set_current_component(null);
        dirty_components.length = 0;
        flushidx = 0;
        while (binding_callbacks.length)
            binding_callbacks.pop()();
        // then, once components are updated, call
        // afterUpdate functions. This may cause
        // subsequent updates...
        for (let i = 0; i < render_callbacks.length; i += 1) {
            const callback = render_callbacks[i];
            if (!seen_callbacks.has(callback)) {
                // ...so guard against infinite loops
                seen_callbacks.add(callback);
                callback();
            }
        }
        render_callbacks.length = 0;
    } while (dirty_components.length);
    while (flush_callbacks.length) {
        flush_callbacks.pop()();
    }
    update_scheduled = false;
    seen_callbacks.clear();
    set_current_component(saved_component);
}
function update($$) {
    if ($$.fragment !== null) {
        $$.update();
        run_all($$.before_update);
        const dirty = $$.dirty;
        $$.dirty = [-1];
        $$.fragment && $$.fragment.p($$.ctx, dirty);
        $$.after_update.forEach(add_render_callback);
    }
}
/**
 * Useful for example to execute remaining `afterUpdate` callbacks before executing `destroy`.
 */
function flush_render_callbacks(fns) {
    const filtered = [];
    const targets = [];
    render_callbacks.forEach((c) => fns.indexOf(c) === -1 ? filtered.push(c) : targets.push(c));
    targets.forEach((c) => c());
    render_callbacks = filtered;
}
const outroing = new Set();
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function mount_component(component, target, anchor, customElement) {
    const { fragment, after_update } = component.$$;
    fragment && fragment.m(target, anchor);
    if (!customElement) {
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = component.$$.on_mount.map(run).filter(is_function);
            // if the component was destroyed immediately
            // it will update the `$$.on_destroy` reference to `null`.
            // the destructured on_destroy may still reference to the old array
            if (component.$$.on_destroy) {
                component.$$.on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
    }
    after_update.forEach(add_render_callback);
}
function destroy_component(component, detaching) {
    const $$ = component.$$;
    if ($$.fragment !== null) {
        flush_render_callbacks($$.after_update);
        run_all($$.on_destroy);
        $$.fragment && $$.fragment.d(detaching);
        // TODO null out other refs, including component.$$ (but need to
        // preserve final state?)
        $$.on_destroy = $$.fragment = null;
        $$.ctx = [];
    }
}
function make_dirty(component, i) {
    if (component.$$.dirty[0] === -1) {
        dirty_components.push(component);
        schedule_update();
        component.$$.dirty.fill(0);
    }
    component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
}
function init(component, options, instance, create_fragment, not_equal, props, append_styles, dirty = [-1]) {
    const parent_component = current_component;
    set_current_component(component);
    const $$ = component.$$ = {
        fragment: null,
        ctx: [],
        // state
        props,
        update: noop,
        not_equal,
        bound: blank_object(),
        // lifecycle
        on_mount: [],
        on_destroy: [],
        on_disconnect: [],
        before_update: [],
        after_update: [],
        context: new Map(options.context || (parent_component ? parent_component.$$.context : [])),
        // everything else
        callbacks: blank_object(),
        dirty,
        skip_bound: false,
        root: options.target || parent_component.$$.root
    };
    append_styles && append_styles($$.root);
    let ready = false;
    $$.ctx = instance
        ? instance(component, options.props || {}, (i, ret, ...rest) => {
            const value = rest.length ? rest[0] : ret;
            if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                if (!$$.skip_bound && $$.bound[i])
                    $$.bound[i](value);
                if (ready)
                    make_dirty(component, i);
            }
            return ret;
        })
        : [];
    $$.update();
    ready = true;
    run_all($$.before_update);
    // `false` as a special case of no DOM component
    $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
    if (options.target) {
        if (options.hydrate) {
            start_hydrating();
            const nodes = children(options.target);
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.l(nodes);
            nodes.forEach(detach);
        }
        else {
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            $$.fragment && $$.fragment.c();
        }
        if (options.intro)
            transition_in(component.$$.fragment);
        mount_component(component, options.target, options.anchor, options.customElement);
        end_hydrating();
        flush();
    }
    set_current_component(parent_component);
}
/**
 * Base class for Svelte components. Used when dev=false.
 */
class SvelteComponent {
    $destroy() {
        destroy_component(this, 1);
        this.$destroy = noop;
    }
    $on(type, callback) {
        if (!is_function(callback)) {
            return noop;
        }
        const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
        callbacks.push(callback);
        return () => {
            const index = callbacks.indexOf(callback);
            if (index !== -1)
                callbacks.splice(index, 1);
        };
    }
    $set($$props) {
        if (this.$$set && !is_empty($$props)) {
            this.$$.skip_bound = true;
            this.$$set($$props);
            this.$$.skip_bound = false;
        }
    }
}

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[23] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[26] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[29] = list[i];
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[32] = list[i];
	child_ctx[34] = i;
	return child_ctx;
}

// (890:2) {#if currentStep === 'upload'}
function create_if_block_5(ctx) {
	let div0;
	let h1;
	let i0;
	let t0;
	let t1;
	let p0;
	let t2;
	let t3;
	let div2;
	let div1;
	let t4;
	let t5;
	let t6;
	let div5;
	let h2;
	let t7;
	let t8;
	let div3;
	let i1;
	let t9;
	let p1;
	let t10;
	let t11;
	let input;
	let t12;
	let label;
	let t13;
	let t14;
	let t15;
	let div4;
	let h3;
	let i2;
	let t16;
	let t17;
	let ul;
	let li0;
	let t18;
	let t19;
	let li1;
	let t20;
	let t21;
	let li2;
	let t22;
	let t23;
	let li3;
	let t24;
	let mounted;
	let dispose;
	let each_value_3 = ['upload', 'api-key', 'evaluation', 'job-desc', 'improved'];
	let each_blocks = [];

	for (let i = 0; i < 5; i += 1) {
		each_blocks[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	let if_block0 = /*error*/ ctx[8] && create_if_block_8(ctx);
	let if_block1 = /*loading*/ ctx[7] && create_if_block_7(ctx);
	let if_block2 = /*resumeFile*/ ctx[1] && create_if_block_6(ctx);

	return {
		c() {
			div0 = element("div");
			h1 = element("h1");
			i0 = element("i");
			t0 = text("\n        Resume Evaluator & Editor");
			t1 = space();
			p0 = element("p");
			t2 = text("Upload your resume, get AI-powered insights, and create an ATS-optimized version");
			t3 = space();
			div2 = element("div");
			div1 = element("div");

			for (let i = 0; i < 5; i += 1) {
				each_blocks[i].c();
			}

			t4 = space();
			if (if_block0) if_block0.c();
			t5 = space();
			if (if_block1) if_block1.c();
			t6 = space();
			div5 = element("div");
			h2 = element("h2");
			t7 = text("Upload Your Resume");
			t8 = space();
			div3 = element("div");
			i1 = element("i");
			t9 = space();
			p1 = element("p");
			t10 = text("Drag and drop your PDF resume here, or click to browse");
			t11 = space();
			input = element("input");
			t12 = space();
			label = element("label");
			t13 = text("Choose PDF File");
			t14 = space();
			if (if_block2) if_block2.c();
			t15 = space();
			div4 = element("div");
			h3 = element("h3");
			i2 = element("i");
			t16 = text("\n          PDF Processing Features:");
			t17 = space();
			ul = element("ul");
			li0 = element("li");
			t18 = text("• Real-time PDF text extraction using PDF.js");
			t19 = space();
			li1 = element("li");
			t20 = text("• Supports multi-page PDF documents");
			t21 = space();
			li2 = element("li");
			t22 = text("• Extracts actual content from your resume");
			t23 = space();
			li3 = element("li");
			t24 = text("• No mock or placeholder data used");
			this.h();
		},
		l(nodes) {
			div0 = claim_element(nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			h1 = claim_element(div0_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			i0 = claim_element(h1_nodes, "I", { class: true });
			children(i0).forEach(detach);
			t0 = claim_text(h1_nodes, "\n        Resume Evaluator & Editor");
			h1_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			p0 = claim_element(div0_nodes, "P", { class: true });
			var p0_nodes = children(p0);
			t2 = claim_text(p0_nodes, "Upload your resume, get AI-powered insights, and create an ATS-optimized version");
			p0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(nodes);
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);

			for (let i = 0; i < 5; i += 1) {
				each_blocks[i].l(div1_nodes);
			}

			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t4 = claim_space(nodes);
			if (if_block0) if_block0.l(nodes);
			t5 = claim_space(nodes);
			if (if_block1) if_block1.l(nodes);
			t6 = claim_space(nodes);
			div5 = claim_element(nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h2 = claim_element(div5_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t7 = claim_text(h2_nodes, "Upload Your Resume");
			h2_nodes.forEach(detach);
			t8 = claim_space(div5_nodes);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			i1 = claim_element(div3_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t9 = claim_space(div3_nodes);
			p1 = claim_element(div3_nodes, "P", { class: true });
			var p1_nodes = children(p1);
			t10 = claim_text(p1_nodes, "Drag and drop your PDF resume here, or click to browse");
			p1_nodes.forEach(detach);
			t11 = claim_space(div3_nodes);

			input = claim_element(div3_nodes, "INPUT", {
				type: true,
				accept: true,
				class: true,
				id: true
			});

			t12 = claim_space(div3_nodes);
			label = claim_element(div3_nodes, "LABEL", { for: true, class: true });
			var label_nodes = children(label);
			t13 = claim_text(label_nodes, "Choose PDF File");
			label_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			t14 = claim_space(div5_nodes);
			if (if_block2) if_block2.l(div5_nodes);
			t15 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			h3 = claim_element(div4_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			i2 = claim_element(h3_nodes, "I", { class: true });
			children(i2).forEach(detach);
			t16 = claim_text(h3_nodes, "\n          PDF Processing Features:");
			h3_nodes.forEach(detach);
			t17 = claim_space(div4_nodes);
			ul = claim_element(div4_nodes, "UL", { class: true });
			var ul_nodes = children(ul);
			li0 = claim_element(ul_nodes, "LI", { class: true });
			var li0_nodes = children(li0);
			t18 = claim_text(li0_nodes, "• Real-time PDF text extraction using PDF.js");
			li0_nodes.forEach(detach);
			t19 = claim_space(ul_nodes);
			li1 = claim_element(ul_nodes, "LI", { class: true });
			var li1_nodes = children(li1);
			t20 = claim_text(li1_nodes, "• Supports multi-page PDF documents");
			li1_nodes.forEach(detach);
			t21 = claim_space(ul_nodes);
			li2 = claim_element(ul_nodes, "LI", { class: true });
			var li2_nodes = children(li2);
			t22 = claim_text(li2_nodes, "• Extracts actual content from your resume");
			li2_nodes.forEach(detach);
			t23 = claim_space(ul_nodes);
			li3 = claim_element(ul_nodes, "LI", { class: true });
			var li3_nodes = children(li3);
			t24 = claim_text(li3_nodes, "• No mock or placeholder data used");
			li3_nodes.forEach(detach);
			ul_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i0, "class", "fas fa-file-alt text-blue-600 mr-3 svelte-1tgbz0z");
			attr(h1, "class", "text-3xl font-bold text-gray-800 mb-2 svelte-1tgbz0z");
			attr(p0, "class", "text-gray-600 svelte-1tgbz0z");
			attr(div0, "class", "text-center mb-8 svelte-1tgbz0z");
			attr(div1, "class", "flex items-center space-x-4 svelte-1tgbz0z");
			attr(div2, "class", "flex justify-center mb-8 svelte-1tgbz0z");
			attr(h2, "class", "text-2xl font-semibold mb-6 text-center svelte-1tgbz0z");
			attr(i1, "class", "fas fa-cloud-upload-alt text-4xl text-gray-400 mb-4 svelte-1tgbz0z");
			attr(p1, "class", "text-gray-600 mb-4 svelte-1tgbz0z");
			attr(input, "type", "file");
			attr(input, "accept", ".pdf");
			attr(input, "class", "hidden svelte-1tgbz0z");
			attr(input, "id", "resume-upload");
			attr(label, "for", "resume-upload");
			attr(label, "class", "bg-blue-600 text-white px-6 py-2 rounded-lg cursor-pointer hover:bg-blue-700 transition-colors svelte-1tgbz0z");
			attr(div3, "class", "border-2 border-dashed border-gray-300 rounded-lg p-8 text-center hover:border-blue-400 transition-colors svelte-1tgbz0z");
			attr(i2, "class", "fas fa-info-circle mr-2 svelte-1tgbz0z");
			attr(h3, "class", "font-semibold text-blue-800 mb-2 svelte-1tgbz0z");
			attr(li0, "class", "svelte-1tgbz0z");
			attr(li1, "class", "svelte-1tgbz0z");
			attr(li2, "class", "svelte-1tgbz0z");
			attr(li3, "class", "svelte-1tgbz0z");
			attr(ul, "class", "text-sm text-blue-700 space-y-1 svelte-1tgbz0z");
			attr(div4, "class", "mt-6 p-4 bg-blue-50 rounded-lg svelte-1tgbz0z");
			attr(div5, "class", "bg-white rounded-lg shadow-lg p-8 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div0, anchor);
			append_hydration(div0, h1);
			append_hydration(h1, i0);
			append_hydration(h1, t0);
			append_hydration(div0, t1);
			append_hydration(div0, p0);
			append_hydration(p0, t2);
			insert_hydration(target, t3, anchor);
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div1);

			for (let i = 0; i < 5; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div1, null);
				}
			}

			insert_hydration(target, t4, anchor);
			if (if_block0) if_block0.m(target, anchor);
			insert_hydration(target, t5, anchor);
			if (if_block1) if_block1.m(target, anchor);
			insert_hydration(target, t6, anchor);
			insert_hydration(target, div5, anchor);
			append_hydration(div5, h2);
			append_hydration(h2, t7);
			append_hydration(div5, t8);
			append_hydration(div5, div3);
			append_hydration(div3, i1);
			append_hydration(div3, t9);
			append_hydration(div3, p1);
			append_hydration(p1, t10);
			append_hydration(div3, t11);
			append_hydration(div3, input);
			/*input_binding*/ ctx[18](input);
			append_hydration(div3, t12);
			append_hydration(div3, label);
			append_hydration(label, t13);
			append_hydration(div5, t14);
			if (if_block2) if_block2.m(div5, null);
			append_hydration(div5, t15);
			append_hydration(div5, div4);
			append_hydration(div4, h3);
			append_hydration(h3, i2);
			append_hydration(h3, t16);
			append_hydration(div4, t17);
			append_hydration(div4, ul);
			append_hydration(ul, li0);
			append_hydration(li0, t18);
			append_hydration(ul, t19);
			append_hydration(ul, li1);
			append_hydration(li1, t20);
			append_hydration(ul, t21);
			append_hydration(ul, li2);
			append_hydration(li2, t22);
			append_hydration(ul, t23);
			append_hydration(ul, li3);
			append_hydration(li3, t24);

			if (!mounted) {
				dispose = listen(input, "change", /*handleFileUpload*/ ctx[10]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentStep*/ 1) {
				each_value_3 = ['upload', 'api-key', 'evaluation', 'job-desc', 'improved'];
				let i;

				for (i = 0; i < 5; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_3(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(div1, null);
					}
				}

				for (; i < 5; i += 1) {
					each_blocks[i].d(1);
				}
			}

			if (/*error*/ ctx[8]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_8(ctx);
					if_block0.c();
					if_block0.m(t5.parentNode, t5);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*loading*/ ctx[7]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_7(ctx);
					if_block1.c();
					if_block1.m(t6.parentNode, t6);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*resumeFile*/ ctx[1]) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_6(ctx);
					if_block2.c();
					if_block2.m(div5, t15);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div0);
			if (detaching) detach(t3);
			if (detaching) detach(div2);
			destroy_each(each_blocks, detaching);
			if (detaching) detach(t4);
			if (if_block0) if_block0.d(detaching);
			if (detaching) detach(t5);
			if (if_block1) if_block1.d(detaching);
			if (detaching) detach(t6);
			if (detaching) detach(div5);
			/*input_binding*/ ctx[18](null);
			if (if_block2) if_block2.d();
			mounted = false;
			dispose();
		}
	};
}

// (911:12) {#if index < 4}
function create_if_block_9(ctx) {
	let div;

	return {
		c() {
			div = element("div");
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			children(div).forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "w-8 h-0.5 bg-gray-300 mx-2 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (902:8) {#each ['upload', 'api-key', 'evaluation', 'job-desc', 'improved'] as step, index}
function create_each_block_3(ctx) {
	let div1;
	let div0;
	let t0_value = /*index*/ ctx[34] + 1 + "";
	let t0;
	let div0_class_value;
	let t1;
	let t2;
	let if_block = /*index*/ ctx[34] < 4 && create_if_block_9();

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			t0 = text(t0_value);
			t1 = space();
			if (if_block) if_block.c();
			t2 = space();
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, t0_value);
			div0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			if (if_block) if_block.l(div1_nodes);
			t2 = claim_space(div1_nodes);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", div0_class_value = "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium " + (/*currentStep*/ ctx[0] === /*step*/ ctx[32]
			? 'bg-blue-600 text-white'
			: ['upload', 'api-key', 'evaluation', 'job-desc', 'improved'].indexOf(/*currentStep*/ ctx[0]) > /*index*/ ctx[34]
				? 'bg-green-500 text-white'
				: 'bg-gray-300 text-gray-600') + " svelte-1tgbz0z");

			attr(div1, "class", "flex items-center svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, t0);
			append_hydration(div1, t1);
			if (if_block) if_block.m(div1, null);
			append_hydration(div1, t2);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentStep*/ 1 && div0_class_value !== (div0_class_value = "w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium " + (/*currentStep*/ ctx[0] === /*step*/ ctx[32]
			? 'bg-blue-600 text-white'
			: ['upload', 'api-key', 'evaluation', 'job-desc', 'improved'].indexOf(/*currentStep*/ ctx[0]) > /*index*/ ctx[34]
				? 'bg-green-500 text-white'
				: 'bg-gray-300 text-gray-600') + " svelte-1tgbz0z")) {
				attr(div0, "class", div0_class_value);
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			if (if_block) if_block.d();
		}
	};
}

// (920:4) {#if error}
function create_if_block_8(ctx) {
	let div;
	let i;
	let t0;
	let t1;

	return {
		c() {
			div = element("div");
			i = element("i");
			t0 = space();
			t1 = text(/*error*/ ctx[8]);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			i = claim_element(div_nodes, "I", { class: true });
			children(i).forEach(detach);
			t0 = claim_space(div_nodes);
			t1 = claim_text(div_nodes, /*error*/ ctx[8]);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i, "class", "fas fa-exclamation-triangle mr-2 svelte-1tgbz0z");
			attr(div, "class", "bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, i);
			append_hydration(div, t0);
			append_hydration(div, t1);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*error*/ 256) set_data(t1, /*error*/ ctx[8]);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (928:4) {#if loading}
function create_if_block_7(ctx) {
	let div1;
	let div0;
	let t0;
	let p;

	let t1_value = (/*currentStep*/ ctx[0] === 'upload'
	? 'Extracting text from PDF...'
	: /*currentStep*/ ctx[0] === 'api-key'
		? 'Analyzing resume with AI...'
		: 'Processing...') + "";

	let t1;

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			t0 = space();
			p = element("p");
			t1 = text(t1_value);
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			children(div0).forEach(detach);
			t0 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t1 = claim_text(p_nodes, t1_value);
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 svelte-1tgbz0z");
			attr(p, "class", "mt-2 text-gray-600 svelte-1tgbz0z");
			attr(div1, "class", "text-center mb-6 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div1, t0);
			append_hydration(div1, p);
			append_hydration(p, t1);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*currentStep*/ 1 && t1_value !== (t1_value = (/*currentStep*/ ctx[0] === 'upload'
			? 'Extracting text from PDF...'
			: /*currentStep*/ ctx[0] === 'api-key'
				? 'Analyzing resume with AI...'
				: 'Processing...') + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(div1);
		}
	};
}

// (960:6) {#if resumeFile}
function create_if_block_6(ctx) {
	let div;
	let i;
	let t0;
	let t1_value = /*resumeFile*/ ctx[1].name + "";
	let t1;

	return {
		c() {
			div = element("div");
			i = element("i");
			t0 = text("\n          File uploaded: ");
			t1 = text(t1_value);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			i = claim_element(div_nodes, "I", { class: true });
			children(i).forEach(detach);
			t0 = claim_text(div_nodes, "\n          File uploaded: ");
			t1 = claim_text(div_nodes, t1_value);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i, "class", "fas fa-check-circle text-green-600 mr-2 svelte-1tgbz0z");
			attr(div, "class", "mt-4 p-4 bg-green-50 rounded-lg svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, i);
			append_hydration(div, t0);
			append_hydration(div, t1);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*resumeFile*/ 2 && t1_value !== (t1_value = /*resumeFile*/ ctx[1].name + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (982:2) {#if currentStep === 'api-key'}
function create_if_block_3(ctx) {
	let div1;
	let h2;
	let t0;
	let t1;
	let div0;
	let label;
	let t2;
	let span;
	let t3;
	let t4;
	let input;
	let t5;
	let p;
	let i0;
	let t6;
	let a;
	let t7;
	let t8;
	let t9;
	let button;
	let i1;
	let t10;
	let button_disabled_value;
	let mounted;
	let dispose;
	let if_block = /*resumeText*/ ctx[2] && create_if_block_4(ctx);

	return {
		c() {
			div1 = element("div");
			h2 = element("h2");
			t0 = text("Enter Google Gemini API Key");
			t1 = space();
			div0 = element("div");
			label = element("label");
			t2 = text("API Key ");
			span = element("span");
			t3 = text("*");
			t4 = space();
			input = element("input");
			t5 = space();
			p = element("p");
			i0 = element("i");
			t6 = text("\n          Get your API key from ");
			a = element("a");
			t7 = text("Google AI Studio");
			t8 = space();
			if (if_block) if_block.c();
			t9 = space();
			button = element("button");
			i1 = element("i");
			t10 = text("\n        Analyze Resume with AI");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Enter Google Gemini API Key");
			h2_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			label = claim_element(div0_nodes, "LABEL", { for: true, class: true });
			var label_nodes = children(label);
			t2 = claim_text(label_nodes, "API Key ");
			span = claim_element(label_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t3 = claim_text(span_nodes, "*");
			span_nodes.forEach(detach);
			label_nodes.forEach(detach);
			t4 = claim_space(div0_nodes);

			input = claim_element(div0_nodes, "INPUT", {
				id: true,
				type: true,
				placeholder: true,
				class: true
			});

			t5 = claim_space(div0_nodes);
			p = claim_element(div0_nodes, "P", { class: true });
			var p_nodes = children(p);
			i0 = claim_element(p_nodes, "I", { class: true });
			children(i0).forEach(detach);
			t6 = claim_text(p_nodes, "\n          Get your API key from ");
			a = claim_element(p_nodes, "A", { href: true, target: true, class: true });
			var a_nodes = children(a);
			t7 = claim_text(a_nodes, "Google AI Studio");
			a_nodes.forEach(detach);
			p_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t8 = claim_space(div1_nodes);
			if (if_block) if_block.l(div1_nodes);
			t9 = claim_space(div1_nodes);
			button = claim_element(div1_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			i1 = claim_element(button_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t10 = claim_text(button_nodes, "\n        Analyze Resume with AI");
			button_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "text-2xl font-semibold mb-6 svelte-1tgbz0z");
			attr(span, "class", "text-red-500 svelte-1tgbz0z");
			attr(label, "for", "api-key-input");
			attr(label, "class", "block text-sm font-medium text-gray-700 mb-2 svelte-1tgbz0z");
			attr(input, "id", "api-key-input");
			attr(input, "type", "password");
			attr(input, "placeholder", "Enter your Google Gemini API key");
			attr(input, "class", "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent svelte-1tgbz0z");
			attr(i0, "class", "fas fa-info-circle mr-1");
			attr(a, "href", "https://makersuite.google.com/app/apikey");
			attr(a, "target", "_blank");
			attr(a, "class", "text-blue-600 hover:underline svelte-1tgbz0z");
			attr(p, "class", "text-sm text-gray-500 mt-2 svelte-1tgbz0z");
			attr(div0, "class", "mb-6 svelte-1tgbz0z");
			attr(i1, "class", "fas fa-search mr-2 svelte-1tgbz0z");
			button.disabled = button_disabled_value = !/*apiKey*/ ctx[3] || /*loading*/ ctx[7];
			attr(button, "class", "w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors svelte-1tgbz0z");
			attr(div1, "class", "bg-white rounded-lg shadow-lg p-8 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, h2);
			append_hydration(h2, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, label);
			append_hydration(label, t2);
			append_hydration(label, span);
			append_hydration(span, t3);
			append_hydration(div0, t4);
			append_hydration(div0, input);
			set_input_value(input, /*apiKey*/ ctx[3]);
			append_hydration(div0, t5);
			append_hydration(div0, p);
			append_hydration(p, i0);
			append_hydration(p, t6);
			append_hydration(p, a);
			append_hydration(a, t7);
			append_hydration(div1, t8);
			if (if_block) if_block.m(div1, null);
			append_hydration(div1, t9);
			append_hydration(div1, button);
			append_hydration(button, i1);
			append_hydration(button, t10);

			if (!mounted) {
				dispose = [
					listen(input, "input", /*input_input_handler*/ ctx[19]),
					listen(button, "click", /*evaluateResume*/ ctx[11])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*apiKey*/ 8 && input.value !== /*apiKey*/ ctx[3]) {
				set_input_value(input, /*apiKey*/ ctx[3]);
			}

			if (/*resumeText*/ ctx[2]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_4(ctx);
					if_block.c();
					if_block.m(div1, t9);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}

			if (dirty[0] & /*apiKey, loading*/ 136 && button_disabled_value !== (button_disabled_value = !/*apiKey*/ ctx[3] || /*loading*/ ctx[7])) {
				button.disabled = button_disabled_value;
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			if (if_block) if_block.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1003:6) {#if resumeText}
function create_if_block_4(ctx) {
	let div1;
	let h3;
	let t0;
	let t1;
	let div0;
	let pre;
	let t2;
	let t3_value = /*resumeText*/ ctx[2].substring(0, 500) + "";
	let t3;
	let t4;
	let t5;
	let p;
	let i;
	let t6;
	let t7_value = /*resumeText*/ ctx[2].length + "";
	let t7;
	let t8;

	return {
		c() {
			div1 = element("div");
			h3 = element("h3");
			t0 = text("Extracted Resume Content Preview:");
			t1 = space();
			div0 = element("div");
			pre = element("pre");
			t2 = text("              ");
			t3 = text(t3_value);
			t4 = text("...\n            ");
			t5 = space();
			p = element("p");
			i = element("i");
			t6 = text("\n            Successfully extracted ");
			t7 = text(t7_value);
			t8 = text(" characters from your PDF");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h3 = claim_element(div1_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "Extracted Resume Content Preview:");
			h3_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			pre = claim_element(div0_nodes, "PRE", { class: true });
			var pre_nodes = children(pre);
			t2 = claim_text(pre_nodes, "              ");
			t3 = claim_text(pre_nodes, t3_value);
			t4 = claim_text(pre_nodes, "...\n            ");
			pre_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			i = claim_element(p_nodes, "I", { class: true });
			children(i).forEach(detach);
			t6 = claim_text(p_nodes, "\n            Successfully extracted ");
			t7 = claim_text(p_nodes, t7_value);
			t8 = claim_text(p_nodes, " characters from your PDF");
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "text-lg font-medium text-gray-700 mb-2 svelte-1tgbz0z");
			attr(pre, "class", "whitespace-pre-wrap text-sm text-gray-700 svelte-1tgbz0z");
			attr(div0, "class", "bg-gray-50 p-4 rounded-lg border max-h-40 overflow-y-auto svelte-1tgbz0z");
			attr(i, "class", "fas fa-check-circle mr-1");
			attr(p, "class", "text-sm text-green-600 mt-2 svelte-1tgbz0z");
			attr(div1, "class", "mb-6 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, h3);
			append_hydration(h3, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, pre);
			append_hydration(pre, t2);
			append_hydration(pre, t3);
			append_hydration(pre, t4);
			append_hydration(div1, t5);
			append_hydration(div1, p);
			append_hydration(p, i);
			append_hydration(p, t6);
			append_hydration(p, t7);
			append_hydration(p, t8);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*resumeText*/ 4 && t3_value !== (t3_value = /*resumeText*/ ctx[2].substring(0, 500) + "")) set_data(t3, t3_value);
			if (dirty[0] & /*resumeText*/ 4 && t7_value !== (t7_value = /*resumeText*/ ctx[2].length + "")) set_data(t7, t7_value);
		},
		d(detaching) {
			if (detaching) detach(div1);
		}
	};
}

// (1029:2) {#if currentStep === 'evaluation' && evaluation}
function create_if_block_2(ctx) {
	let div9;
	let h2;
	let t0;
	let t1;
	let div4;
	let div0;
	let ScoreCircle_action;
	let t2;
	let div1;
	let ScoreCircle_action_1;
	let t3;
	let div2;
	let ScoreCircle_action_2;
	let t4;
	let div3;
	let ScoreCircle_action_3;
	let t5;
	let div7;
	let div5;
	let h30;
	let i0;
	let t6;
	let t7;
	let ul0;
	let t8;
	let div6;
	let h31;
	let i1;
	let t9;
	let t10;
	let ul1;
	let t11;
	let div8;
	let h32;
	let i2;
	let t12;
	let t13;
	let ul2;
	let t14;
	let button;
	let i3;
	let t15;
	let mounted;
	let dispose;
	let each_value_2 = /*evaluation*/ ctx[5].strengths;
	let each_blocks_2 = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks_2[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	let each_value_1 = /*evaluation*/ ctx[5].weaknesses;
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*evaluation*/ ctx[5].suggestions;
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	return {
		c() {
			div9 = element("div");
			h2 = element("h2");
			t0 = text("AI Resume Analysis Results");
			t1 = space();
			div4 = element("div");
			div0 = element("div");
			t2 = space();
			div1 = element("div");
			t3 = space();
			div2 = element("div");
			t4 = space();
			div3 = element("div");
			t5 = space();
			div7 = element("div");
			div5 = element("div");
			h30 = element("h3");
			i0 = element("i");
			t6 = text("Strengths");
			t7 = space();
			ul0 = element("ul");

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].c();
			}

			t8 = space();
			div6 = element("div");
			h31 = element("h3");
			i1 = element("i");
			t9 = text("Areas for Improvement");
			t10 = space();
			ul1 = element("ul");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t11 = space();
			div8 = element("div");
			h32 = element("h3");
			i2 = element("i");
			t12 = text("AI Recommendations");
			t13 = space();
			ul2 = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t14 = space();
			button = element("button");
			i3 = element("i");
			t15 = text("\n        Optimize My Resume");
			this.h();
		},
		l(nodes) {
			div9 = claim_element(nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			h2 = claim_element(div9_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "AI Resume Analysis Results");
			h2_nodes.forEach(detach);
			t1 = claim_space(div9_nodes);
			div4 = claim_element(div9_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div0 = claim_element(div4_nodes, "DIV", {});
			children(div0).forEach(detach);
			t2 = claim_space(div4_nodes);
			div1 = claim_element(div4_nodes, "DIV", {});
			children(div1).forEach(detach);
			t3 = claim_space(div4_nodes);
			div2 = claim_element(div4_nodes, "DIV", {});
			children(div2).forEach(detach);
			t4 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", {});
			children(div3).forEach(detach);
			div4_nodes.forEach(detach);
			t5 = claim_space(div9_nodes);
			div7 = claim_element(div9_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			div5 = claim_element(div7_nodes, "DIV", {});
			var div5_nodes = children(div5);
			h30 = claim_element(div5_nodes, "H3", { class: true });
			var h30_nodes = children(h30);
			i0 = claim_element(h30_nodes, "I", { class: true });
			children(i0).forEach(detach);
			t6 = claim_text(h30_nodes, "Strengths");
			h30_nodes.forEach(detach);
			t7 = claim_space(div5_nodes);
			ul0 = claim_element(div5_nodes, "UL", { class: true });
			var ul0_nodes = children(ul0);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				each_blocks_2[i].l(ul0_nodes);
			}

			ul0_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t8 = claim_space(div7_nodes);
			div6 = claim_element(div7_nodes, "DIV", {});
			var div6_nodes = children(div6);
			h31 = claim_element(div6_nodes, "H3", { class: true });
			var h31_nodes = children(h31);
			i1 = claim_element(h31_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t9 = claim_text(h31_nodes, "Areas for Improvement");
			h31_nodes.forEach(detach);
			t10 = claim_space(div6_nodes);
			ul1 = claim_element(div6_nodes, "UL", { class: true });
			var ul1_nodes = children(ul1);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(ul1_nodes);
			}

			ul1_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t11 = claim_space(div9_nodes);
			div8 = claim_element(div9_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			h32 = claim_element(div8_nodes, "H3", { class: true });
			var h32_nodes = children(h32);
			i2 = claim_element(h32_nodes, "I", { class: true });
			children(i2).forEach(detach);
			t12 = claim_text(h32_nodes, "AI Recommendations");
			h32_nodes.forEach(detach);
			t13 = claim_space(div8_nodes);
			ul2 = claim_element(div8_nodes, "UL", { class: true });
			var ul2_nodes = children(ul2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul2_nodes);
			}

			ul2_nodes.forEach(detach);
			div8_nodes.forEach(detach);
			t14 = claim_space(div9_nodes);
			button = claim_element(div9_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			i3 = claim_element(button_nodes, "I", { class: true });
			children(i3).forEach(detach);
			t15 = claim_text(button_nodes, "\n        Optimize My Resume");
			button_nodes.forEach(detach);
			div9_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "text-2xl font-semibold mb-6 svelte-1tgbz0z");
			attr(div4, "class", "grid grid-cols-2 md:grid-cols-4 gap-4 mb-8 svelte-1tgbz0z");
			attr(i0, "class", "fas fa-check-circle mr-2 svelte-1tgbz0z");
			attr(h30, "class", "text-lg font-semibold text-green-600 mb-3 svelte-1tgbz0z");
			attr(ul0, "class", "space-y-2 svelte-1tgbz0z");
			attr(i1, "class", "fas fa-exclamation-triangle mr-2 svelte-1tgbz0z");
			attr(h31, "class", "text-lg font-semibold text-red-600 mb-3 svelte-1tgbz0z");
			attr(ul1, "class", "space-y-2 svelte-1tgbz0z");
			attr(div7, "class", "grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 svelte-1tgbz0z");
			attr(i2, "class", "fas fa-lightbulb mr-2 svelte-1tgbz0z");
			attr(h32, "class", "text-lg font-semibold text-blue-600 mb-3 svelte-1tgbz0z");
			attr(ul2, "class", "space-y-2 svelte-1tgbz0z");
			attr(div8, "class", "mb-8 svelte-1tgbz0z");
			attr(i3, "class", "fas fa-edit mr-2 svelte-1tgbz0z");
			attr(button, "class", "w-full bg-green-600 text-white py-3 rounded-lg hover:bg-green-700 transition-colors svelte-1tgbz0z");
			attr(div9, "class", "bg-white rounded-lg shadow-lg p-8 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div9, anchor);
			append_hydration(div9, h2);
			append_hydration(h2, t0);
			append_hydration(div9, t1);
			append_hydration(div9, div4);
			append_hydration(div4, div0);
			append_hydration(div4, t2);
			append_hydration(div4, div1);
			append_hydration(div4, t3);
			append_hydration(div4, div2);
			append_hydration(div4, t4);
			append_hydration(div4, div3);
			append_hydration(div9, t5);
			append_hydration(div9, div7);
			append_hydration(div7, div5);
			append_hydration(div5, h30);
			append_hydration(h30, i0);
			append_hydration(h30, t6);
			append_hydration(div5, t7);
			append_hydration(div5, ul0);

			for (let i = 0; i < each_blocks_2.length; i += 1) {
				if (each_blocks_2[i]) {
					each_blocks_2[i].m(ul0, null);
				}
			}

			append_hydration(div7, t8);
			append_hydration(div7, div6);
			append_hydration(div6, h31);
			append_hydration(h31, i1);
			append_hydration(h31, t9);
			append_hydration(div6, t10);
			append_hydration(div6, ul1);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(ul1, null);
				}
			}

			append_hydration(div9, t11);
			append_hydration(div9, div8);
			append_hydration(div8, h32);
			append_hydration(h32, i2);
			append_hydration(h32, t12);
			append_hydration(div8, t13);
			append_hydration(div8, ul2);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul2, null);
				}
			}

			append_hydration(div9, t14);
			append_hydration(div9, button);
			append_hydration(button, i3);
			append_hydration(button, t15);

			if (!mounted) {
				dispose = [
					action_destroyer(ScoreCircle_action = ScoreCircle.call(null, div0, {
						score: /*evaluation*/ ctx[5].overallScore,
						label: "Overall Score"
					})),
					action_destroyer(ScoreCircle_action_1 = ScoreCircle.call(null, div1, {
						score: /*evaluation*/ ctx[5].atsScore,
						label: "ATS Score"
					})),
					action_destroyer(ScoreCircle_action_2 = ScoreCircle.call(null, div2, {
						score: /*evaluation*/ ctx[5].readabilityScore,
						label: "Readability"
					})),
					action_destroyer(ScoreCircle_action_3 = ScoreCircle.call(null, div3, {
						score: /*evaluation*/ ctx[5].keywordMatch,
						label: "Keywords"
					})),
					listen(button, "click", /*click_handler*/ ctx[20])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (ScoreCircle_action && is_function(ScoreCircle_action.update) && dirty[0] & /*evaluation*/ 32) ScoreCircle_action.update.call(null, {
				score: /*evaluation*/ ctx[5].overallScore,
				label: "Overall Score"
			});

			if (ScoreCircle_action_1 && is_function(ScoreCircle_action_1.update) && dirty[0] & /*evaluation*/ 32) ScoreCircle_action_1.update.call(null, {
				score: /*evaluation*/ ctx[5].atsScore,
				label: "ATS Score"
			});

			if (ScoreCircle_action_2 && is_function(ScoreCircle_action_2.update) && dirty[0] & /*evaluation*/ 32) ScoreCircle_action_2.update.call(null, {
				score: /*evaluation*/ ctx[5].readabilityScore,
				label: "Readability"
			});

			if (ScoreCircle_action_3 && is_function(ScoreCircle_action_3.update) && dirty[0] & /*evaluation*/ 32) ScoreCircle_action_3.update.call(null, {
				score: /*evaluation*/ ctx[5].keywordMatch,
				label: "Keywords"
			});

			if (dirty[0] & /*evaluation*/ 32) {
				each_value_2 = /*evaluation*/ ctx[5].strengths;
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks_2[i]) {
						each_blocks_2[i].p(child_ctx, dirty);
					} else {
						each_blocks_2[i] = create_each_block_2(child_ctx);
						each_blocks_2[i].c();
						each_blocks_2[i].m(ul0, null);
					}
				}

				for (; i < each_blocks_2.length; i += 1) {
					each_blocks_2[i].d(1);
				}

				each_blocks_2.length = each_value_2.length;
			}

			if (dirty[0] & /*evaluation*/ 32) {
				each_value_1 = /*evaluation*/ ctx[5].weaknesses;
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(ul1, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty[0] & /*evaluation*/ 32) {
				each_value = /*evaluation*/ ctx[5].suggestions;
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(ul2, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}
		},
		d(detaching) {
			if (detaching) detach(div9);
			destroy_each(each_blocks_2, detaching);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1048:12) {#each evaluation.strengths as strength}
function create_each_block_2(ctx) {
	let li;
	let i;
	let t0;
	let span;
	let t1_value = /*strength*/ ctx[29] + "";
	let t1;
	let t2;

	return {
		c() {
			li = element("li");
			i = element("i");
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			i = claim_element(li_nodes, "I", { class: true });
			children(i).forEach(detach);
			t0 = claim_space(li_nodes);
			span = claim_element(li_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			t2 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i, "class", "fas fa-plus text-green-500 mr-2 mt-1 svelte-1tgbz0z");
			attr(span, "class", "text-gray-700 svelte-1tgbz0z");
			attr(li, "class", "flex items-start svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, i);
			append_hydration(li, t0);
			append_hydration(li, span);
			append_hydration(span, t1);
			append_hydration(li, t2);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*evaluation*/ 32 && t1_value !== (t1_value = /*strength*/ ctx[29] + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1061:12) {#each evaluation.weaknesses as weakness}
function create_each_block_1(ctx) {
	let li;
	let i;
	let t0;
	let span;
	let t1_value = /*weakness*/ ctx[26] + "";
	let t1;
	let t2;

	return {
		c() {
			li = element("li");
			i = element("i");
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			i = claim_element(li_nodes, "I", { class: true });
			children(i).forEach(detach);
			t0 = claim_space(li_nodes);
			span = claim_element(li_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			t2 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i, "class", "fas fa-minus text-red-500 mr-2 mt-1 svelte-1tgbz0z");
			attr(span, "class", "text-gray-700 svelte-1tgbz0z");
			attr(li, "class", "flex items-start svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, i);
			append_hydration(li, t0);
			append_hydration(li, span);
			append_hydration(span, t1);
			append_hydration(li, t2);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*evaluation*/ 32 && t1_value !== (t1_value = /*weakness*/ ctx[26] + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1077:10) {#each evaluation.suggestions as suggestion}
function create_each_block(ctx) {
	let li;
	let i;
	let t0;
	let span;
	let t1_value = /*suggestion*/ ctx[23] + "";
	let t1;
	let t2;

	return {
		c() {
			li = element("li");
			i = element("i");
			t0 = space();
			span = element("span");
			t1 = text(t1_value);
			t2 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			i = claim_element(li_nodes, "I", { class: true });
			children(i).forEach(detach);
			t0 = claim_space(li_nodes);
			span = claim_element(li_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t1 = claim_text(span_nodes, t1_value);
			span_nodes.forEach(detach);
			t2 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(i, "class", "fas fa-arrow-right text-blue-500 mr-2 mt-1 svelte-1tgbz0z");
			attr(span, "class", "text-gray-700 svelte-1tgbz0z");
			attr(li, "class", "flex items-start svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, i);
			append_hydration(li, t0);
			append_hydration(li, span);
			append_hydration(span, t1);
			append_hydration(li, t2);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*evaluation*/ 32 && t1_value !== (t1_value = /*suggestion*/ ctx[23] + "")) set_data(t1, t1_value);
		},
		d(detaching) {
			if (detaching) detach(li);
		}
	};
}

// (1096:2) {#if currentStep === 'job-desc'}
function create_if_block_1(ctx) {
	let div1;
	let h2;
	let t0;
	let t1;
	let div0;
	let label;
	let t2;
	let span;
	let t3;
	let t4;
	let textarea;
	let t5;
	let p;
	let i0;
	let t6;
	let t7;
	let button;
	let i1;
	let t8;
	let button_disabled_value;
	let mounted;
	let dispose;

	return {
		c() {
			div1 = element("div");
			h2 = element("h2");
			t0 = text("Target Job Description");
			t1 = space();
			div0 = element("div");
			label = element("label");
			t2 = text("Paste the job description you're applying for ");
			span = element("span");
			t3 = text("*");
			t4 = space();
			textarea = element("textarea");
			t5 = space();
			p = element("p");
			i0 = element("i");
			t6 = text("\n          AI will optimize your resume using keywords and requirements from this job description");
			t7 = space();
			button = element("button");
			i1 = element("i");
			t8 = text("\n        Generate Optimized Resume");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Target Job Description");
			h2_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			label = claim_element(div0_nodes, "LABEL", { for: true, class: true });
			var label_nodes = children(label);
			t2 = claim_text(label_nodes, "Paste the job description you're applying for ");
			span = claim_element(label_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t3 = claim_text(span_nodes, "*");
			span_nodes.forEach(detach);
			label_nodes.forEach(detach);
			t4 = claim_space(div0_nodes);

			textarea = claim_element(div0_nodes, "TEXTAREA", {
				id: true,
				placeholder: true,
				rows: true,
				class: true
			});

			children(textarea).forEach(detach);
			t5 = claim_space(div0_nodes);
			p = claim_element(div0_nodes, "P", { class: true });
			var p_nodes = children(p);
			i0 = claim_element(p_nodes, "I", { class: true });
			children(i0).forEach(detach);
			t6 = claim_text(p_nodes, "\n          AI will optimize your resume using keywords and requirements from this job description");
			p_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t7 = claim_space(div1_nodes);
			button = claim_element(div1_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			i1 = claim_element(button_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t8 = claim_text(button_nodes, "\n        Generate Optimized Resume");
			button_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "text-2xl font-semibold mb-6 svelte-1tgbz0z");
			attr(span, "class", "text-red-500 svelte-1tgbz0z");
			attr(label, "for", "job-description-input");
			attr(label, "class", "block text-sm font-medium text-gray-700 mb-2 svelte-1tgbz0z");
			attr(textarea, "id", "job-description-input");
			attr(textarea, "placeholder", "Paste the complete job description here...");
			attr(textarea, "rows", "10");
			attr(textarea, "class", "w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent svelte-1tgbz0z");
			attr(i0, "class", "fas fa-info-circle mr-1");
			attr(p, "class", "text-sm text-gray-500 mt-2 svelte-1tgbz0z");
			attr(div0, "class", "mb-6 svelte-1tgbz0z");
			attr(i1, "class", "fas fa-magic mr-2 svelte-1tgbz0z");
			button.disabled = button_disabled_value = !/*jobDescription*/ ctx[4].trim() || /*loading*/ ctx[7];
			attr(button, "class", "w-full bg-blue-600 text-white py-3 rounded-lg hover:bg-blue-700 disabled:bg-gray-400 transition-colors svelte-1tgbz0z");
			attr(div1, "class", "bg-white rounded-lg shadow-lg p-8 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, h2);
			append_hydration(h2, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, label);
			append_hydration(label, t2);
			append_hydration(label, span);
			append_hydration(span, t3);
			append_hydration(div0, t4);
			append_hydration(div0, textarea);
			set_input_value(textarea, /*jobDescription*/ ctx[4]);
			append_hydration(div0, t5);
			append_hydration(div0, p);
			append_hydration(p, i0);
			append_hydration(p, t6);
			append_hydration(div1, t7);
			append_hydration(div1, button);
			append_hydration(button, i1);
			append_hydration(button, t8);

			if (!mounted) {
				dispose = [
					listen(textarea, "input", /*textarea_input_handler*/ ctx[21]),
					listen(button, "click", /*improveResume*/ ctx[12])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*jobDescription*/ 16) {
				set_input_value(textarea, /*jobDescription*/ ctx[4]);
			}

			if (dirty[0] & /*jobDescription, loading*/ 144 && button_disabled_value !== (button_disabled_value = !/*jobDescription*/ ctx[4].trim() || /*loading*/ ctx[7])) {
				button.disabled = button_disabled_value;
			}
		},
		d(detaching) {
			if (detaching) detach(div1);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1126:2) {#if currentStep === 'improved' && improvedResume}
function create_if_block(ctx) {
	let div4;
	let div1;
	let h2;
	let t0;
	let t1;
	let div0;
	let button0;
	let i0;
	let t2;
	let t3;
	let button1;
	let i1;
	let t4;
	let t5;
	let button2;
	let i2;
	let t6;
	let t7;
	let button3;
	let i3;
	let t8;
	let t9;
	let div2;
	let pre;
	let t10;
	let t11;
	let t12;
	let t13;
	let div3;
	let h3;
	let i4;
	let t14;
	let t15;
	let ul;
	let li0;
	let t16;
	let t17;
	let li1;
	let t18;
	let t19;
	let li2;
	let t20;
	let t21;
	let li3;
	let t22;
	let t23;
	let li4;
	let t24;
	let t25;
	let li5;
	let t26;
	let mounted;
	let dispose;

	return {
		c() {
			div4 = element("div");
			div1 = element("div");
			h2 = element("h2");
			t0 = text("Your Optimized Resume");
			t1 = space();
			div0 = element("div");
			button0 = element("button");
			i0 = element("i");
			t2 = text("\n            Download TXT");
			t3 = space();
			button1 = element("button");
			i1 = element("i");
			t4 = text("\n            Download HTML");
			t5 = space();
			button2 = element("button");
			i2 = element("i");
			t6 = text("\n            Copy");
			t7 = space();
			button3 = element("button");
			i3 = element("i");
			t8 = text("\n            Start Over");
			t9 = space();
			div2 = element("div");
			pre = element("pre");
			t10 = text("          ");
			t11 = text(/*improvedResume*/ ctx[6]);
			t12 = text("\n        ");
			t13 = space();
			div3 = element("div");
			h3 = element("h3");
			i4 = element("i");
			t14 = text("\n          AI Optimizations Applied:");
			t15 = space();
			ul = element("ul");
			li0 = element("li");
			t16 = text("• Enhanced with job-specific keywords from your actual resume content");
			t17 = space();
			li1 = element("li");
			t18 = text("• Improved ATS compatibility and formatting");
			t19 = space();
			li2 = element("li");
			t20 = text("• Optimized structure and section organization");
			t21 = space();
			li3 = element("li");
			t22 = text("• Maintained all your original factual information");
			t23 = space();
			li4 = element("li");
			t24 = text("• Applied professional formatting standards");
			t25 = space();
			li5 = element("li");
			t26 = text("• No fictional data added - only your real content enhanced");
			this.h();
		},
		l(nodes) {
			div4 = claim_element(nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			div1 = claim_element(div4_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t0 = claim_text(h2_nodes, "Your Optimized Resume");
			h2_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true, "aria-label": true });
			var button0_nodes = children(button0);
			i0 = claim_element(button0_nodes, "I", { class: true });
			children(i0).forEach(detach);
			t2 = claim_text(button0_nodes, "\n            Download TXT");
			button0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true, "aria-label": true });
			var button1_nodes = children(button1);
			i1 = claim_element(button1_nodes, "I", { class: true });
			children(i1).forEach(detach);
			t4 = claim_text(button1_nodes, "\n            Download HTML");
			button1_nodes.forEach(detach);
			t5 = claim_space(div0_nodes);
			button2 = claim_element(div0_nodes, "BUTTON", { class: true, "aria-label": true });
			var button2_nodes = children(button2);
			i2 = claim_element(button2_nodes, "I", { class: true });
			children(i2).forEach(detach);
			t6 = claim_text(button2_nodes, "\n            Copy");
			button2_nodes.forEach(detach);
			t7 = claim_space(div0_nodes);
			button3 = claim_element(div0_nodes, "BUTTON", { class: true, "aria-label": true });
			var button3_nodes = children(button3);
			i3 = claim_element(button3_nodes, "I", { class: true });
			children(i3).forEach(detach);
			t8 = claim_text(button3_nodes, "\n            Start Over");
			button3_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t9 = claim_space(div4_nodes);

			div2 = claim_element(div4_nodes, "DIV", {
				class: true,
				role: true,
				"aria-label": true
			});

			var div2_nodes = children(div2);
			pre = claim_element(div2_nodes, "PRE", { class: true });
			var pre_nodes = children(pre);
			t10 = claim_text(pre_nodes, "          ");
			t11 = claim_text(pre_nodes, /*improvedResume*/ ctx[6]);
			t12 = claim_text(pre_nodes, "\n        ");
			pre_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t13 = claim_space(div4_nodes);
			div3 = claim_element(div4_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			h3 = claim_element(div3_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			i4 = claim_element(h3_nodes, "I", { class: true });
			children(i4).forEach(detach);
			t14 = claim_text(h3_nodes, "\n          AI Optimizations Applied:");
			h3_nodes.forEach(detach);
			t15 = claim_space(div3_nodes);
			ul = claim_element(div3_nodes, "UL", { class: true });
			var ul_nodes = children(ul);
			li0 = claim_element(ul_nodes, "LI", { class: true });
			var li0_nodes = children(li0);
			t16 = claim_text(li0_nodes, "• Enhanced with job-specific keywords from your actual resume content");
			li0_nodes.forEach(detach);
			t17 = claim_space(ul_nodes);
			li1 = claim_element(ul_nodes, "LI", { class: true });
			var li1_nodes = children(li1);
			t18 = claim_text(li1_nodes, "• Improved ATS compatibility and formatting");
			li1_nodes.forEach(detach);
			t19 = claim_space(ul_nodes);
			li2 = claim_element(ul_nodes, "LI", { class: true });
			var li2_nodes = children(li2);
			t20 = claim_text(li2_nodes, "• Optimized structure and section organization");
			li2_nodes.forEach(detach);
			t21 = claim_space(ul_nodes);
			li3 = claim_element(ul_nodes, "LI", { class: true });
			var li3_nodes = children(li3);
			t22 = claim_text(li3_nodes, "• Maintained all your original factual information");
			li3_nodes.forEach(detach);
			t23 = claim_space(ul_nodes);
			li4 = claim_element(ul_nodes, "LI", { class: true });
			var li4_nodes = children(li4);
			t24 = claim_text(li4_nodes, "• Applied professional formatting standards");
			li4_nodes.forEach(detach);
			t25 = claim_space(ul_nodes);
			li5 = claim_element(ul_nodes, "LI", { class: true });
			var li5_nodes = children(li5);
			t26 = claim_text(li5_nodes, "• No fictional data added - only your real content enhanced");
			li5_nodes.forEach(detach);
			ul_nodes.forEach(detach);
			div3_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h2, "class", "text-2xl font-semibold svelte-1tgbz0z");
			attr(i0, "class", "fas fa-download mr-2 svelte-1tgbz0z");
			attr(button0, "class", "bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition-colors svelte-1tgbz0z");
			attr(button0, "aria-label", "Download resume as text file");
			attr(i1, "class", "fas fa-file-code mr-2 svelte-1tgbz0z");
			attr(button1, "class", "bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 transition-colors svelte-1tgbz0z");
			attr(button1, "aria-label", "Download resume as HTML file");
			attr(i2, "class", "fas fa-copy mr-2 svelte-1tgbz0z");
			attr(button2, "class", "bg-purple-600 text-white px-4 py-2 rounded-lg hover:bg-purple-700 transition-colors svelte-1tgbz0z");
			attr(button2, "aria-label", "Copy resume to clipboard");
			attr(i3, "class", "fas fa-redo mr-2 svelte-1tgbz0z");
			attr(button3, "class", "bg-gray-600 text-white px-4 py-2 rounded-lg hover:bg-gray-700 transition-colors svelte-1tgbz0z");
			attr(button3, "aria-label", "Start over with new resume");
			attr(div0, "class", "space-x-2");
			attr(div1, "class", "flex justify-between items-center mb-6 svelte-1tgbz0z");
			attr(pre, "class", "whitespace-pre-wrap text-sm text-gray-800 svelte-1tgbz0z");
			attr(div2, "class", "bg-gray-50 p-6 rounded-lg border svelte-1tgbz0z");
			attr(div2, "role", "region");
			attr(div2, "aria-label", "Optimized resume content");
			attr(i4, "class", "fas fa-check-circle mr-2 svelte-1tgbz0z");
			attr(h3, "class", "font-semibold text-green-800 mb-2 svelte-1tgbz0z");
			attr(li0, "class", "svelte-1tgbz0z");
			attr(li1, "class", "svelte-1tgbz0z");
			attr(li2, "class", "svelte-1tgbz0z");
			attr(li3, "class", "svelte-1tgbz0z");
			attr(li4, "class", "svelte-1tgbz0z");
			attr(li5, "class", "svelte-1tgbz0z");
			attr(ul, "class", "text-sm text-green-700 space-y-1 svelte-1tgbz0z");
			attr(div3, "class", "mt-6 p-4 bg-green-50 rounded-lg svelte-1tgbz0z");
			attr(div4, "class", "bg-white rounded-lg shadow-lg p-8 svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div4, anchor);
			append_hydration(div4, div1);
			append_hydration(div1, h2);
			append_hydration(h2, t0);
			append_hydration(div1, t1);
			append_hydration(div1, div0);
			append_hydration(div0, button0);
			append_hydration(button0, i0);
			append_hydration(button0, t2);
			append_hydration(div0, t3);
			append_hydration(div0, button1);
			append_hydration(button1, i1);
			append_hydration(button1, t4);
			append_hydration(div0, t5);
			append_hydration(div0, button2);
			append_hydration(button2, i2);
			append_hydration(button2, t6);
			append_hydration(div0, t7);
			append_hydration(div0, button3);
			append_hydration(button3, i3);
			append_hydration(button3, t8);
			append_hydration(div4, t9);
			append_hydration(div4, div2);
			append_hydration(div2, pre);
			append_hydration(pre, t10);
			append_hydration(pre, t11);
			append_hydration(pre, t12);
			append_hydration(div4, t13);
			append_hydration(div4, div3);
			append_hydration(div3, h3);
			append_hydration(h3, i4);
			append_hydration(h3, t14);
			append_hydration(div3, t15);
			append_hydration(div3, ul);
			append_hydration(ul, li0);
			append_hydration(li0, t16);
			append_hydration(ul, t17);
			append_hydration(ul, li1);
			append_hydration(li1, t18);
			append_hydration(ul, t19);
			append_hydration(ul, li2);
			append_hydration(li2, t20);
			append_hydration(ul, t21);
			append_hydration(ul, li3);
			append_hydration(li3, t22);
			append_hydration(ul, t23);
			append_hydration(ul, li4);
			append_hydration(li4, t24);
			append_hydration(ul, t25);
			append_hydration(ul, li5);
			append_hydration(li5, t26);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*downloadResumeAsText*/ ctx[13]),
					listen(button1, "click", /*downloadResumeAsHTML*/ ctx[14]),
					listen(button2, "click", /*copyToClipboard*/ ctx[15]),
					listen(button3, "click", /*resetApp*/ ctx[16])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*improvedResume*/ 64) set_data(t11, /*improvedResume*/ ctx[6]);
		},
		d(detaching) {
			if (detaching) detach(div4);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div;
	let t0;
	let t1;
	let t2;
	let t3;
	let if_block0 = /*currentStep*/ ctx[0] === 'upload' && create_if_block_5(ctx);
	let if_block1 = /*currentStep*/ ctx[0] === 'api-key' && create_if_block_3(ctx);
	let if_block2 = /*currentStep*/ ctx[0] === 'evaluation' && /*evaluation*/ ctx[5] && create_if_block_2(ctx);
	let if_block3 = /*currentStep*/ ctx[0] === 'job-desc' && create_if_block_1(ctx);
	let if_block4 = /*currentStep*/ ctx[0] === 'improved' && /*improvedResume*/ ctx[6] && create_if_block(ctx);

	return {
		c() {
			div = element("div");
			if (if_block0) if_block0.c();
			t0 = space();
			if (if_block1) if_block1.c();
			t1 = space();
			if (if_block2) if_block2.c();
			t2 = space();
			if (if_block3) if_block3.c();
			t3 = space();
			if (if_block4) if_block4.c();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			if (if_block0) if_block0.l(div_nodes);
			t0 = claim_space(div_nodes);
			if (if_block1) if_block1.l(div_nodes);
			t1 = claim_space(div_nodes);
			if (if_block2) if_block2.l(div_nodes);
			t2 = claim_space(div_nodes);
			if (if_block3) if_block3.l(div_nodes);
			t3 = claim_space(div_nodes);
			if (if_block4) if_block4.l(div_nodes);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "max-w-4xl mx-auto p-6 bg-white svelte-1tgbz0z");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			if (if_block0) if_block0.m(div, null);
			append_hydration(div, t0);
			if (if_block1) if_block1.m(div, null);
			append_hydration(div, t1);
			if (if_block2) if_block2.m(div, null);
			append_hydration(div, t2);
			if (if_block3) if_block3.m(div, null);
			append_hydration(div, t3);
			if (if_block4) if_block4.m(div, null);
		},
		p(ctx, dirty) {
			if (/*currentStep*/ ctx[0] === 'upload') {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_5(ctx);
					if_block0.c();
					if_block0.m(div, t0);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (/*currentStep*/ ctx[0] === 'api-key') {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_3(ctx);
					if_block1.c();
					if_block1.m(div, t1);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}

			if (/*currentStep*/ ctx[0] === 'evaluation' && /*evaluation*/ ctx[5]) {
				if (if_block2) {
					if_block2.p(ctx, dirty);
				} else {
					if_block2 = create_if_block_2(ctx);
					if_block2.c();
					if_block2.m(div, t2);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (/*currentStep*/ ctx[0] === 'job-desc') {
				if (if_block3) {
					if_block3.p(ctx, dirty);
				} else {
					if_block3 = create_if_block_1(ctx);
					if_block3.c();
					if_block3.m(div, t3);
				}
			} else if (if_block3) {
				if_block3.d(1);
				if_block3 = null;
			}

			if (/*currentStep*/ ctx[0] === 'improved' && /*improvedResume*/ ctx[6]) {
				if (if_block4) {
					if_block4.p(ctx, dirty);
				} else {
					if_block4 = create_if_block(ctx);
					if_block4.c();
					if_block4.m(div, null);
				}
			} else if (if_block4) {
				if_block4.d(1);
				if_block4 = null;
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(div);
			if (if_block0) if_block0.d();
			if (if_block1) if_block1.d();
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			if (if_block4) if_block4.d();
		}
	};
}

async function extractTextFromPDF(file) {
	try {
		const arrayBuffer = await file.arrayBuffer();

		// Load PDF.js from CDN if not already loaded
		if (!window.pdfjsLib) {
			await new Promise((resolve, reject) => {
					const script = document.createElement('script');
					script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
					script.onload = resolve;
					script.onerror = reject;
					document.head.appendChild(script);
				});
		}

		// Set worker source
		if (!window.pdfjsLib.GlobalWorkerOptions.workerSrc) {
			window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
		}

		const pdf = await window.pdfjsLib.getDocument(arrayBuffer).promise;
		let fullText = '';

		// Extract text from all pages
		for (let i = 1; i <= pdf.numPages; i++) {
			const page = await pdf.getPage(i);
			const textContent = await page.getTextContent();
			const pageText = textContent.items.map(item => item.str).join(' ');
			fullText += pageText + '\n';
		}

		return fullText.trim();
	} catch(error) {
		console.error('PDF extraction error:', error);
		throw new Error('Failed to extract text from PDF. Please ensure the file is not corrupted and contains readable text.');
	}
}

// ScoreCircle Component Logic (updated for 0-10 scale)
function ScoreCircle(node, { score, label }) {
	const strokeColor = score >= 8
	? "#10b981"
	: score >= 6 ? "#f59e0b" : "#ef4444";

	const strokeDasharray = `${score * 25.1} 251`;

	node.innerHTML = `
    <div class="flex flex-col items-center">
      <div class="relative w-12 h-12">
        <svg class="w-12 h-12 transform -rotate-90" viewBox="0 0 100 100">
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="#e5e7eb"
            stroke-width="8"
            fill="none"
          />
          <circle
            cx="50"
            cy="50"
            r="40"
            stroke="${strokeColor}"
            stroke-width="8"
            fill="none"
            stroke-dasharray="${strokeDasharray}"
            stroke-linecap="round"
          />
        </svg>
        <div class="absolute inset-0 flex items-center justify-center">
          <span class="text-xs font-bold">${score}/10</span>
        </div>
      </div>
      <span class="text-xs text-gray-600 mt-1 text-center">${label}</span>
    </div>
  `;

	return {
		update({ score: newScore, label: newLabel }) {
			const newStrokeColor = newScore >= 8
			? "#10b981"
			: newScore >= 6 ? "#f59e0b" : "#ef4444";

			const newStrokeDasharray = `${newScore * 25.1} 251`;
			const circle = node.querySelector('circle:last-child');
			const span = node.querySelector('span');
			const labelSpan = node.querySelector('.text-xs');

			if (circle) {
				circle.setAttribute('stroke', newStrokeColor);
				circle.setAttribute('stroke-dasharray', newStrokeDasharray);
			}

			if (span) {
				span.textContent = `${newScore}/10`;
			}

			if (labelSpan) {
				labelSpan.textContent = newLabel;
			}
		}
	};
}

function formatResumeContent(resumeText) {
	// Parse the resume text and convert to structured HTML
	const lines = resumeText.split('\n');

	let html = '';
	let currentSection = '';
	let inHeader = true;

	for (let i = 0; i < lines.length; i++) {
		const line = lines[i].trim();
		if (!line) continue;

		// Detect header information
		if (inHeader && (line.includes('@') || line.includes('phone') || line.includes('linkedin'))) {
			if (!html.includes('<div class="header">')) {
				html += '<div class="header">';

				// Extract name (usually first non-empty line)
				const nameMatch = resumeText.match(/^([A-Z][a-z]+ [A-Z][a-z]+)/m);

				if (nameMatch) {
					html += `<div class="name">${nameMatch[1]}</div>`;
				}

				html += '<div class="contact-info">';
			}

			// Format contact information
			if (line.includes('@')) {
				html += `<div class="contact-item">📧 ${line}</div>`;
			} else if (line.includes('phone') || line.match(/\(\d{3}\)/)) {
				html += `<div class="contact-item">📞 ${line}</div>`;
			} else if (line.includes('linkedin')) {
				html += `<div class="contact-item">🔗 ${line}</div>`;
			} else {
				html += `<div class="contact-item">📍 ${line}</div>`;
			}

			continue;
		}

		// Close header if we've moved past contact info
		if (inHeader && (line.toUpperCase().includes('SUMMARY') || line.toUpperCase().includes('EXPERIENCE'))) {
			html += '</div></div>';
			inHeader = false;
		}

		// Detect section headers
		if (line.toUpperCase() === line && line.length > 3 && (line.includes('SUMMARY') || line.includes('EXPERIENCE') || line.includes('EDUCATION') || line.includes('SKILLS') || line.includes('PROJECTS'))) {
			if (currentSection) html += '</div>';
			currentSection = line;
			html += `<div class="section"><div class="section-title">${line}</div><div class="content">`;
			continue;
		}

		// Format content based on section
		if (currentSection.includes('SUMMARY')) {
			html += `<div class="summary-text">${line}</div>`;
		} else if (currentSection.includes('EXPERIENCE')) {
			if (line.match(/^\w+.*\d{4}/)) {
				html += `<div class="job-title">${line}</div>`;
			} else if (line.includes('•') || line.startsWith('-')) {
				html += `<div class="achievement">${line.replace(/^[•-]\s*/, '')}</div>`;
			} else {
				html += `<div class="company">${line}</div>`;
			}
		} else if (currentSection.includes('EDUCATION')) {
			html += `<div class="education-item"><div class="degree">${line}</div></div>`;
		} else if (currentSection.includes('SKILLS')) {
			if (line.includes(':')) {
				const [category, skills] = line.split(':');

				html += `<div class="skill-category">
          <h4>${category.trim()}</h4>
          <div class="skill-tags">
            ${skills.split(',').map(skill => `<span class="skill-tag">${skill.trim()}</span>`).join('')}
          </div>
        </div>`;
			} else {
				html += `<div class="skill-tag">${line}</div>`;
			}
		} else {
			html += `<div>${line}</div>`;
		}
	}

	if (currentSection) html += '</div></div>';
	return html;
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	// Initialize all variables with proper defaults
	let currentStep = 'upload';

	let resumeFile = null;
	let resumeText = '';
	let apiKey = '';
	let jobDescription = '';
	let evaluation = null;
	let improvedResume = '';
	let loading = false;
	let error = '';
	let fileInput;

	async function handleFileUpload(event) {
		const file = event.target.files[0];

		if (file && file.type === 'application/pdf') {
			$$invalidate(1, resumeFile = file);
			$$invalidate(7, loading = true);
			$$invalidate(8, error = '');

			try {
				const text = await extractTextFromPDF(file);

				if (!text || text.trim().length < 50) {
					throw new Error('Unable to extract sufficient text from PDF. Please ensure the PDF contains readable text.');
				}

				$$invalidate(2, resumeText = text);
				$$invalidate(0, currentStep = 'api-key');
			} catch(err) {
				$$invalidate(8, error = err.message);
			}

			$$invalidate(7, loading = false);
		} else {
			$$invalidate(8, error = 'Please upload a PDF file');
		}
	}

	async function callGeminiAPI(prompt) {
		if (!apiKey) {
			throw new Error('API key is required');
		}

		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [{ parts: [{ text: prompt }] }]
			})
		});

		if (!response.ok) {
			const errorData = await response.json().catch(() => ({}));
			throw new Error(`API call failed: ${response.status} ${response.statusText}. ${errorData.error?.message || ''}`);
		}

		const data = await response.json();

		if (!data.candidates || !data.candidates[0] || !data.candidates[0].content) {
			throw new Error('Invalid response from API');
		}

		return data.candidates[0].content.parts[0].text;
	}

	async function evaluateResume() {
		if (!apiKey) {
			$$invalidate(8, error = 'Please enter your Google Gemini API key');
			return;
		}

		if (!resumeText || resumeText.trim().length < 50) {
			$$invalidate(8, error = 'No sufficient resume content found. Please upload a valid PDF with readable text.');
			return;
		}

		$$invalidate(7, loading = true);
		$$invalidate(8, error = '');

		try {
			const evaluationPrompt = `
Please analyze the following resume and provide a detailed evaluation in JSON format with the following exact structure:
{
  "overallScore": (number between 0-10),
  "strengths": [array of strings describing strengths],
  "weaknesses": [array of strings describing areas for improvement],
  "suggestions": [array of strings with specific recommendations],
  "atsScore": (number between 0-10 for ATS compatibility),
  "readabilityScore": (number between 0-10 for readability),
  "keywordMatch": (number between 0-10 for keyword optimization)
}

Resume content:
${resumeText}

Focus on:
- ATS compatibility and formatting
- Professional content quality and relevance
- Skills presentation and organization
- Achievement quantification
- Overall structure and readability
- Industry-specific keywords

Provide only the JSON response without any additional text or formatting.
`;

			const response = await callGeminiAPI(evaluationPrompt);

			// Try to parse JSON response
			let evaluationData;

			try {
				// Clean the response and extract JSON
				const cleanedResponse = response.replace(/```json|```/g, '').trim();

				const jsonMatch = cleanedResponse.match(/\{[\s\S]*\}/);

				if (jsonMatch) {
					evaluationData = JSON.parse(jsonMatch[0]);
				} else {
					throw new Error('No JSON found in response');
				}

				// Validate required fields
				if (!evaluationData.overallScore || !evaluationData.strengths || !evaluationData.weaknesses) {
					throw new Error('Invalid evaluation format');
				}
			} catch(parseError) {
				console.error('JSON parsing error:', parseError);

				// Create a basic evaluation if parsing fails
				evaluationData = {
					overallScore: 7.0,
					strengths: ['Resume content successfully analyzed'],
					weaknesses: ['Detailed analysis temporarily unavailable'],
					suggestions: ['Please try the evaluation again'],
					atsScore: 6.0,
					readabilityScore: 7.0,
					keywordMatch: 5.0
				};
			}

			$$invalidate(5, evaluation = evaluationData);
			$$invalidate(0, currentStep = 'evaluation');
		} catch(err) {
			$$invalidate(8, error = `Failed to evaluate resume: ${err.message}`);
		}

		$$invalidate(7, loading = false);
	}

	async function improveResume() {
		if (!jobDescription.trim()) {
			$$invalidate(8, error = 'Please enter the job description');
			return;
		}

		if (!resumeText || resumeText.trim().length < 50) {
			$$invalidate(8, error = 'No resume content found');
			return;
		}

		$$invalidate(7, loading = true);
		$$invalidate(8, error = '');

		try {
			const improvementPrompt = `
Please improve the following resume based on the job description provided. 
Create an enhanced, ATS-friendly version that:

1. Uses ONLY the ACTUAL content from the original resume (do not create fake information)
2. Optimizes keywords for the specific job requirements
3. Improves formatting and structure for ATS compatibility
4. Quantifies achievements where possible (only if data exists in original)
5. Maintains professional, clean formatting
6. Uses appropriate section headers (SUMMARY, EXPERIENCE, EDUCATION, SKILLS, etc.)
7. Keeps all original factual information accurate and truthful
8. Enhances existing content without adding fictional details

Original Resume Content:
${resumeText}

Target Job Description:
${jobDescription}

Please provide the improved resume in a clean, professional format with proper sections and formatting. Focus on optimizing the existing content rather than adding new information. Use standard section headers and maintain ATS-friendly formatting.
`;

			const improvedContent = await callGeminiAPI(improvementPrompt);

			if (!improvedContent || improvedContent.trim().length < 100) {
				throw new Error('Generated resume content is too short or invalid');
			}

			$$invalidate(6, improvedResume = improvedContent);
			$$invalidate(0, currentStep = 'improved');
		} catch(err) {
			$$invalidate(8, error = `Failed to improve resume: ${err.message}`);
		}

		$$invalidate(7, loading = false);
	}

	// function downloadResume() {
	//   try {
	//     const element = document.createElement('a');
	//     const file = new Blob([improvedResume], { type: 'text/plain' });
	//     element.href = URL.createObjectURL(file);
	//     element.download = `improved_resume_${new Date().toISOString().split('T')[0]}.txt`;
	//     document.body.appendChild(element);
	//     element.click();
	//     document.body.removeChild(element);
	//   } catch (err) {
	//     error = 'Failed to download resume';
	//   }
	// }
	function downloadResumeAsText() {
		try {
			const element = document.createElement('a');
			const file = new Blob([improvedResume], { type: 'text/plain' });
			element.href = URL.createObjectURL(file);
			element.download = `improved_resume_${new Date().toISOString().split('T')[0]}.txt`;
			document.body.appendChild(element);
			element.click();
			document.body.removeChild(element);
		} catch(err) {
			$$invalidate(8, error = 'Failed to download resume as text');
		}
	}

	function downloadResumeAsHTML() {
		try {
			// Convert the resume text to beautifully formatted HTML
			const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Professional Resume</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 8.5in;
            margin: 0 auto;
            padding: 0.5in;
            background: white;
        }
        
        .header {
            text-align: center;
            padding: 20px 0;
            border-bottom: 3px solid #2563eb;
            margin-bottom: 25px;
            background: linear-gradient(135deg, #f8fafc 0%, #e2e8f0 100%);
            border-radius: 8px 8px 0 0;
        }
        
        .name {
            font-size: 28px;
            font-weight: 700;
            color: #1e40af;
            margin-bottom: 8px;
            letter-spacing: 1px;
        }
        
        .contact-info {
            font-size: 14px;
            color: #64748b;
            display: flex;
            justify-content: center;
            flex-wrap: wrap;
            gap: 15px;
        }
        
        .contact-item {
            display: flex;
            align-items: center;
            gap: 5px;
        }
        
        .section {
            margin-bottom: 25px;
            page-break-inside: avoid;
        }
        
        .section-title {
            font-size: 18px;
            font-weight: 700;
            color: #1e40af;
            text-transform: uppercase;
            letter-spacing: 1px;
            padding: 8px 0;
            border-bottom: 2px solid #3b82f6;
            margin-bottom: 15px;
            position: relative;
        }
        
        .section-title::after {
            content: '';
            position: absolute;
            bottom: -2px;
            left: 0;
            width: 50px;
            height: 2px;
            background: #10b981;
        }
        
        .content {
            font-size: 14px;
            line-height: 1.7;
        }
        
        .job-title {
            font-weight: 600;
            color: #1e40af;
            font-size: 16px;
            margin-bottom: 5px;
        }
        
        .company {
            font-weight: 500;
            color: #059669;
            margin-bottom: 3px;
        }
        
        .date {
            color: #6b7280;
            font-style: italic;
            margin-bottom: 10px;
        }
        
        .achievement {
            margin: 8px 0;
            padding-left: 15px;
            position: relative;
        }
        
        .achievement::before {
            content: '▸';
            position: absolute;
            left: 0;
            color: #3b82f6;
            font-weight: bold;
        }
        
        .skills-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
            gap: 20px;
            margin-top: 15px;
        }
        
        .skill-category {
            background: #f8fafc;
            padding: 15px;
            border-radius: 8px;
            border-left: 4px solid #3b82f6;
        }
        
        .skill-category h4 {
            color: #1e40af;
            font-weight: 600;
            margin-bottom: 8px;
        }
        
        .skill-tags {
            display: flex;
            flex-wrap: wrap;
            gap: 6px;
        }
        
        .skill-tag {
            background: #dbeafe;
            color: #1e40af;
            padding: 4px 8px;
            border-radius: 12px;
            font-size: 12px;
            font-weight: 500;
        }
        
        .education-item {
            margin-bottom: 15px;
            padding: 15px;
            background: #f8fafc;
            border-radius: 8px;
            border-left: 4px solid #10b981;
        }
        
        .degree {
            font-weight: 600;
            color: #1e40af;
            font-size: 15px;
        }
        
        .school {
            color: #059669;
            font-weight: 500;
        }
        
        .summary-text {
            background: #f0f9ff;
            padding: 20px;
            border-radius: 8px;
            border-left: 4px solid #0ea5e9;
            font-size: 15px;
            line-height: 1.8;
            color: #0f172a;
        }
        
        /* Print styles */
        @media print {
            body {
                margin: 0;
                padding: 0.3in;
                font-size: 12px;
            }
            .header {
                background: white !important;
                -webkit-print-color-adjust: exact;
            }
            .section-title {
                color: #000 !important;
                border-bottom: 1px solid #000 !important;
            }
            .skill-category, .education-item, .summary-text {
                background: white !important;
                border: 1px solid #ccc !important;
            }
        }
        
        /* ATS-friendly styles */
        .ats-friendly {
            font-family: Arial, sans-serif;
            font-size: 11pt;
            line-height: 1.5;
        }
    </style>
</head>
<body class="ats-friendly">
    <div class="resume-container">
        ${formatResumeContent(improvedResume)}
    </div>
</body>
</html>`;

			const element = document.createElement('a');
			const file = new Blob([htmlContent], { type: 'text/html' });
			element.href = URL.createObjectURL(file);
			element.download = `professional_resume_${new Date().toISOString().split('T')[0]}.html`;
			document.body.appendChild(element);
			element.click();
			document.body.removeChild(element);
		} catch(err) {
			$$invalidate(8, error = 'Failed to download resume as HTML');
		}
	}

	async function copyToClipboard() {
		try {
			await navigator.clipboard.writeText(improvedResume);

			// Show temporary success message
			const originalError = error;

			$$invalidate(8, error = '');

			// You could add a toast notification here instead
			setTimeout(
				() => {
					$$invalidate(8, error = originalError);
				},
				2000
			);
		} catch(err) {
			$$invalidate(8, error = 'Failed to copy to clipboard');
		}
	}

	function resetApp() {
		$$invalidate(0, currentStep = 'upload');
		$$invalidate(1, resumeFile = null);
		$$invalidate(2, resumeText = '');
		$$invalidate(4, jobDescription = '');
		$$invalidate(5, evaluation = null);
		$$invalidate(6, improvedResume = '');
		$$invalidate(8, error = '');
		$$invalidate(3, apiKey = '');
	}

	function input_binding($$value) {
		binding_callbacks[$$value ? 'unshift' : 'push'](() => {
			fileInput = $$value;
			$$invalidate(9, fileInput);
		});
	}

	function input_input_handler() {
		apiKey = this.value;
		$$invalidate(3, apiKey);
	}

	const click_handler = () => $$invalidate(0, currentStep = 'job-desc');

	function textarea_input_handler() {
		jobDescription = this.value;
		$$invalidate(4, jobDescription);
	}

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(17, props = $$props.props);
	};

	return [
		currentStep,
		resumeFile,
		resumeText,
		apiKey,
		jobDescription,
		evaluation,
		improvedResume,
		loading,
		error,
		fileInput,
		handleFileUpload,
		evaluateResume,
		improveResume,
		downloadResumeAsText,
		downloadResumeAsHTML,
		copyToClipboard,
		resetApp,
		props,
		input_binding,
		input_input_handler,
		click_handler,
		textarea_input_handler
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 17 }, null, [-1, -1]);
	}
}

export { Component as default };
