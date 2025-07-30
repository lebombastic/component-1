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
function select_option(select, value, mounting) {
    for (let i = 0; i < select.options.length; i += 1) {
        const option = select.options[i];
        if (option.__value === value) {
            option.selected = true;
            return;
        }
    }
    if (!mounting || value !== undefined) {
        select.selectedIndex = -1; // no option should be selected
    }
}
function select_value(select) {
    const selected_option = select.querySelector(':checked');
    return selected_option && selected_option.__value;
}
function toggle_class(element, name, toggle) {
    element.classList[toggle ? 'add' : 'remove'](name);
}

let current_component;
function set_current_component(component) {
    current_component = component;
}
function get_current_component() {
    if (!current_component)
        throw new Error('Function called outside component initialization');
    return current_component;
}
/**
 * The `onMount` function schedules a callback to run as soon as the component has been mounted to the DOM.
 * It must be called during the component's initialisation (but doesn't need to live *inside* the component;
 * it can be called from an external module).
 *
 * `onMount` does not run inside a [server-side component](/docs#run-time-server-side-component-api).
 *
 * https://svelte.dev/docs#run-time-svelte-onmount
 */
function onMount(fn) {
    get_current_component().$$.on_mount.push(fn);
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
	child_ctx[39] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[42] = list[i];
	return child_ctx;
}

function get_each_context_2(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[45] = list[i];
	return child_ctx;
}

function get_each_context_3(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[48] = list[i][0];
	child_ctx[49] = list[i][1];
	return child_ctx;
}

// (739:4) {#if showApiConfig}
function create_if_block_3(ctx) {
	let div5;
	let h3;
	let t0;
	let t1;
	let div0;
	let label0;
	let t2;
	let t3;
	let select0;
	let t4;
	let div1;
	let label1;
	let t5;
	let t6;
	let select1;
	let t7;
	let div3;
	let label2;
	let t8;
	let a;
	let t9;
	let a_href_value;
	let t10;
	let div2;
	let input;
	let t11;
	let button0;
	let button0_disabled_value;
	let t12;
	let small;
	let t13;
	let t14;
	let t15;
	let div4;
	let button1;
	let t16;
	let t17;
	let button2;
	let t18;
	let mounted;
	let dispose;
	let each_value_3 = Object.entries(/*apiProviders*/ ctx[16]);
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_3.length; i += 1) {
		each_blocks_1[i] = create_each_block_3(get_each_context_3(ctx, each_value_3, i));
	}

	let each_value_2 = /*availableModels*/ ctx[14];
	let each_blocks = [];

	for (let i = 0; i < each_value_2.length; i += 1) {
		each_blocks[i] = create_each_block_2(get_each_context_2(ctx, each_value_2, i));
	}

	function select_block_type(ctx, dirty) {
		if (/*isTestingAPI*/ ctx[10]) return create_if_block_5;
		return create_else_block_2;
	}

	let current_block_type = select_block_type(ctx);
	let if_block0 = current_block_type(ctx);
	let if_block1 = /*testResult*/ ctx[11] && create_if_block_4(ctx);

	return {
		c() {
			div5 = element("div");
			h3 = element("h3");
			t0 = text("API Configuration");
			t1 = space();
			div0 = element("div");
			label0 = element("label");
			t2 = text("AI Provider");
			t3 = space();
			select0 = element("select");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t4 = space();
			div1 = element("div");
			label1 = element("label");
			t5 = text("Model");
			t6 = space();
			select1 = element("select");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t7 = space();
			div3 = element("div");
			label2 = element("label");
			t8 = text("API Key\n    ");
			a = element("a");
			t9 = text("🔗");
			t10 = space();
			div2 = element("div");
			input = element("input");
			t11 = space();
			button0 = element("button");
			if_block0.c();
			t12 = space();
			small = element("small");
			t13 = text("Your API key is stored locally and never sent to our servers.");
			t14 = space();
			if (if_block1) if_block1.c();
			t15 = space();
			div4 = element("div");
			button1 = element("button");
			t16 = text("Save Configuration");
			t17 = space();
			button2 = element("button");
			t18 = text("Cancel");
			this.h();
		},
		l(nodes) {
			div5 = claim_element(nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			h3 = claim_element(div5_nodes, "H3", { class: true });
			var h3_nodes = children(h3);
			t0 = claim_text(h3_nodes, "API Configuration");
			h3_nodes.forEach(detach);
			t1 = claim_space(div5_nodes);
			div0 = claim_element(div5_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			label0 = claim_element(div0_nodes, "LABEL", { for: true, class: true });
			var label0_nodes = children(label0);
			t2 = claim_text(label0_nodes, "AI Provider");
			label0_nodes.forEach(detach);
			t3 = claim_space(div0_nodes);
			select0 = claim_element(div0_nodes, "SELECT", { id: true, class: true });
			var select0_nodes = children(select0);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(select0_nodes);
			}

			select0_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t4 = claim_space(div5_nodes);
			div1 = claim_element(div5_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			label1 = claim_element(div1_nodes, "LABEL", { for: true, class: true });
			var label1_nodes = children(label1);
			t5 = claim_text(label1_nodes, "Model");
			label1_nodes.forEach(detach);
			t6 = claim_space(div1_nodes);
			select1 = claim_element(div1_nodes, "SELECT", { id: true, class: true });
			var select1_nodes = children(select1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(select1_nodes);
			}

			select1_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t7 = claim_space(div5_nodes);
			div3 = claim_element(div5_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			label2 = claim_element(div3_nodes, "LABEL", { for: true, class: true });
			var label2_nodes = children(label2);
			t8 = claim_text(label2_nodes, "API Key\n    ");

			a = claim_element(label2_nodes, "A", {
				href: true,
				target: true,
				rel: true,
				class: true,
				title: true
			});

			var a_nodes = children(a);
			t9 = claim_text(a_nodes, "🔗");
			a_nodes.forEach(detach);
			label2_nodes.forEach(detach);
			t10 = claim_space(div3_nodes);
			div2 = claim_element(div3_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);

			input = claim_element(div2_nodes, "INPUT", {
				id: true,
				type: true,
				placeholder: true,
				class: true
			});

			t11 = claim_space(div2_nodes);
			button0 = claim_element(div2_nodes, "BUTTON", { class: true, title: true });
			var button0_nodes = children(button0);
			if_block0.l(button0_nodes);
			button0_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t12 = claim_space(div3_nodes);
			small = claim_element(div3_nodes, "SMALL", { class: true });
			var small_nodes = children(small);
			t13 = claim_text(small_nodes, "Your API key is stored locally and never sent to our servers.");
			small_nodes.forEach(detach);
			t14 = claim_space(div3_nodes);
			if (if_block1) if_block1.l(div3_nodes);
			div3_nodes.forEach(detach);
			t15 = claim_space(div5_nodes);
			div4 = claim_element(div5_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			button1 = claim_element(div4_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t16 = claim_text(button1_nodes, "Save Configuration");
			button1_nodes.forEach(detach);
			t17 = claim_space(div4_nodes);
			button2 = claim_element(div4_nodes, "BUTTON", { class: true });
			var button2_nodes = children(button2);
			t18 = claim_text(button2_nodes, "Cancel");
			button2_nodes.forEach(detach);
			div4_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(h3, "class", "svelte-1vwvqek");
			attr(label0, "for", "apiProvider");
			attr(label0, "class", "svelte-1vwvqek");
			attr(select0, "id", "apiProvider");
			attr(select0, "class", "svelte-1vwvqek");
			if (/*apiProvider*/ ctx[1] === void 0) add_render_callback(() => /*select0_change_handler*/ ctx[24].call(select0));
			attr(div0, "class", "form-group svelte-1vwvqek");
			attr(label1, "for", "apiModel");
			attr(label1, "class", "svelte-1vwvqek");
			attr(select1, "id", "apiModel");
			attr(select1, "class", "svelte-1vwvqek");
			if (/*apiModel*/ ctx[2] === void 0) add_render_callback(() => /*select1_change_handler*/ ctx[25].call(select1));
			attr(div1, "class", "form-group svelte-1vwvqek");
			attr(a, "href", a_href_value = /*apiLinks*/ ctx[15][/*apiProvider*/ ctx[1]]);
			attr(a, "target", "_blank");
			attr(a, "rel", "noopener noreferrer");
			attr(a, "class", "api-link svelte-1vwvqek");
			attr(a, "title", "Get API key");
			attr(label2, "for", "apiKey");
			attr(label2, "class", "svelte-1vwvqek");
			attr(input, "id", "apiKey");
			attr(input, "type", "password");
			attr(input, "placeholder", "Enter your API key...");
			attr(input, "class", "svelte-1vwvqek");
			attr(button0, "class", "test-btn svelte-1vwvqek");
			button0.disabled = button0_disabled_value = /*isTestingAPI*/ ctx[10] || !/*apiKey*/ ctx[12];
			attr(button0, "title", "Test API connection");
			attr(div2, "class", "api-key-container svelte-1vwvqek");
			attr(small, "class", "help-text svelte-1vwvqek");
			attr(div3, "class", "form-group svelte-1vwvqek");
			attr(button1, "class", "save-config-btn svelte-1vwvqek");
			attr(button2, "class", "cancel-btn svelte-1vwvqek");
			attr(div4, "class", "config-actions svelte-1vwvqek");
			attr(div5, "class", "api-config svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, div5, anchor);
			append_hydration(div5, h3);
			append_hydration(h3, t0);
			append_hydration(div5, t1);
			append_hydration(div5, div0);
			append_hydration(div0, label0);
			append_hydration(label0, t2);
			append_hydration(div0, t3);
			append_hydration(div0, select0);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(select0, null);
				}
			}

			select_option(select0, /*apiProvider*/ ctx[1], true);
			append_hydration(div5, t4);
			append_hydration(div5, div1);
			append_hydration(div1, label1);
			append_hydration(label1, t5);
			append_hydration(div1, t6);
			append_hydration(div1, select1);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(select1, null);
				}
			}

			select_option(select1, /*apiModel*/ ctx[2], true);
			append_hydration(div5, t7);
			append_hydration(div5, div3);
			append_hydration(div3, label2);
			append_hydration(label2, t8);
			append_hydration(label2, a);
			append_hydration(a, t9);
			append_hydration(div3, t10);
			append_hydration(div3, div2);
			append_hydration(div2, input);
			set_input_value(input, /*apiKey*/ ctx[12]);
			append_hydration(div2, t11);
			append_hydration(div2, button0);
			if_block0.m(button0, null);
			append_hydration(div3, t12);
			append_hydration(div3, small);
			append_hydration(small, t13);
			append_hydration(div3, t14);
			if (if_block1) if_block1.m(div3, null);
			append_hydration(div5, t15);
			append_hydration(div5, div4);
			append_hydration(div4, button1);
			append_hydration(button1, t16);
			append_hydration(div4, t17);
			append_hydration(div4, button2);
			append_hydration(button2, t18);

			if (!mounted) {
				dispose = [
					listen(select0, "change", /*select0_change_handler*/ ctx[24]),
					listen(select1, "change", /*select1_change_handler*/ ctx[25]),
					listen(input, "input", /*input_input_handler*/ ctx[26]),
					listen(button0, "click", /*testAPIConnection*/ ctx[19]),
					listen(button1, "click", /*saveConfig*/ ctx[21]),
					listen(button2, "click", /*click_handler_1*/ ctx[27])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*apiProviders*/ 65536) {
				each_value_3 = Object.entries(/*apiProviders*/ ctx[16]);
				let i;

				for (i = 0; i < each_value_3.length; i += 1) {
					const child_ctx = get_each_context_3(ctx, each_value_3, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_3(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(select0, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_3.length;
			}

			if (dirty[0] & /*apiProvider, apiProviders*/ 65538) {
				select_option(select0, /*apiProvider*/ ctx[1]);
			}

			if (dirty[0] & /*availableModels*/ 16384) {
				each_value_2 = /*availableModels*/ ctx[14];
				let i;

				for (i = 0; i < each_value_2.length; i += 1) {
					const child_ctx = get_each_context_2(ctx, each_value_2, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block_2(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(select1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value_2.length;
			}

			if (dirty[0] & /*apiModel, availableModels*/ 16388) {
				select_option(select1, /*apiModel*/ ctx[2]);
			}

			if (dirty[0] & /*apiProvider, apiProviders*/ 65538 && a_href_value !== (a_href_value = /*apiLinks*/ ctx[15][/*apiProvider*/ ctx[1]])) {
				attr(a, "href", a_href_value);
			}

			if (dirty[0] & /*apiKey*/ 4096 && input.value !== /*apiKey*/ ctx[12]) {
				set_input_value(input, /*apiKey*/ ctx[12]);
			}

			if (current_block_type !== (current_block_type = select_block_type(ctx))) {
				if_block0.d(1);
				if_block0 = current_block_type(ctx);

				if (if_block0) {
					if_block0.c();
					if_block0.m(button0, null);
				}
			}

			if (dirty[0] & /*isTestingAPI, apiKey*/ 5120 && button0_disabled_value !== (button0_disabled_value = /*isTestingAPI*/ ctx[10] || !/*apiKey*/ ctx[12])) {
				button0.disabled = button0_disabled_value;
			}

			if (/*testResult*/ ctx[11]) {
				if (if_block1) {
					if_block1.p(ctx, dirty);
				} else {
					if_block1 = create_if_block_4(ctx);
					if_block1.c();
					if_block1.m(div3, null);
				}
			} else if (if_block1) {
				if_block1.d(1);
				if_block1 = null;
			}
		},
		d(detaching) {
			if (detaching) detach(div5);
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			if_block0.d();
			if (if_block1) if_block1.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

// (746:12) {#each Object.entries(apiProviders) as [key, provider]}
function create_each_block_3(ctx) {
	let option;
	let t_value = /*provider*/ ctx[49].name + "";
	let t;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			option = claim_element(nodes, "OPTION", {});
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach);
			this.h();
		},
		h() {
			option.__value = /*key*/ ctx[48];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert_hydration(target, option, anchor);
			append_hydration(option, t);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (755:12) {#each availableModels as model}
function create_each_block_2(ctx) {
	let option;
	let t_value = /*model*/ ctx[45] + "";
	let t;
	let option_value_value;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			option = claim_element(nodes, "OPTION", {});
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach);
			this.h();
		},
		h() {
			option.__value = option_value_value = /*model*/ ctx[45];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert_hydration(target, option, anchor);
			append_hydration(option, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*availableModels*/ 16384 && t_value !== (t_value = /*model*/ ctx[45] + "")) set_data(t, t_value);

			if (dirty[0] & /*availableModels*/ 16384 && option_value_value !== (option_value_value = /*model*/ ctx[45])) {
				option.__value = option_value_value;
				option.value = option.__value;
			}
		},
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (789:6) {:else}
function create_else_block_2(ctx) {
	let t;

	return {
		c() {
			t = text("🧪");
		},
		l(nodes) {
			t = claim_text(nodes, "🧪");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (787:6) {#if isTestingAPI}
function create_if_block_5(ctx) {
	let span;

	return {
		c() {
			span = element("span");
			this.h();
		},
		l(nodes) {
			span = claim_element(nodes, "SPAN", { class: true });
			children(span).forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "spinner-small svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, span, anchor);
		},
		d(detaching) {
			if (detaching) detach(span);
		}
	};
}

// (795:2) {#if testResult}
function create_if_block_4(ctx) {
	let div;
	let t;

	return {
		c() {
			div = element("div");
			t = text(/*testResult*/ ctx[11]);
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);
			t = claim_text(div_nodes, /*testResult*/ ctx[11]);
			div_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div, "class", "test-result svelte-1vwvqek");
			toggle_class(div, "success", /*testResult*/ ctx[11].includes('✅'));
			toggle_class(div, "error", /*testResult*/ ctx[11].includes('❌'));
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);
			append_hydration(div, t);
		},
		p(ctx, dirty) {
			if (dirty[0] & /*testResult*/ 2048) set_data(t, /*testResult*/ ctx[11]);

			if (dirty[0] & /*testResult*/ 2048) {
				toggle_class(div, "success", /*testResult*/ ctx[11].includes('✅'));
			}

			if (dirty[0] & /*testResult*/ 2048) {
				toggle_class(div, "error", /*testResult*/ ctx[11].includes('❌'));
			}
		},
		d(detaching) {
			if (detaching) detach(div);
		}
	};
}

// (813:8) {#each Object.keys(categories) as category}
function create_each_block_1(ctx) {
	let option;
	let t_value = /*category*/ ctx[42] + "";
	let t;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			option = claim_element(nodes, "OPTION", {});
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach);
			this.h();
		},
		h() {
			option.__value = /*category*/ ctx[42];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert_hydration(target, option, anchor);
			append_hydration(option, t);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (843:8) {#each toneOptions as tone}
function create_each_block(ctx) {
	let option;
	let t_value = /*tone*/ ctx[39] + "";
	let t;

	return {
		c() {
			option = element("option");
			t = text(t_value);
			this.h();
		},
		l(nodes) {
			option = claim_element(nodes, "OPTION", {});
			var option_nodes = children(option);
			t = claim_text(option_nodes, t_value);
			option_nodes.forEach(detach);
			this.h();
		},
		h() {
			option.__value = /*tone*/ ctx[39];
			option.value = option.__value;
		},
		m(target, anchor) {
			insert_hydration(target, option, anchor);
			append_hydration(option, t);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(option);
		}
	};
}

// (877:6) {:else}
function create_else_block_1(ctx) {
	let t;

	return {
		c() {
			t = text("🤖 Generate AI Prompt");
		},
		l(nodes) {
			t = claim_text(nodes, "🤖 Generate AI Prompt");
		},
		m(target, anchor) {
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(t);
		}
	};
}

// (874:6) {#if isGenerating}
function create_if_block_2(ctx) {
	let span;
	let t;

	return {
		c() {
			span = element("span");
			t = text("\n        Generating...");
			this.h();
		},
		l(nodes) {
			span = claim_element(nodes, "SPAN", { class: true });
			children(span).forEach(detach);
			t = claim_text(nodes, "\n        Generating...");
			this.h();
		},
		h() {
			attr(span, "class", "spinner svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, span, anchor);
			insert_hydration(target, t, anchor);
		},
		d(detaching) {
			if (detaching) detach(span);
			if (detaching) detach(t);
		}
	};
}

// (882:4) {#if !apiKey}
function create_if_block_1(ctx) {
	let p;
	let t;

	return {
		c() {
			p = element("p");
			t = text("⚠️ Please configure your API key to generate prompts");
			this.h();
		},
		l(nodes) {
			p = claim_element(nodes, "P", { class: true });
			var p_nodes = children(p);
			t = claim_text(p_nodes, "⚠️ Please configure your API key to generate prompts");
			p_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(p, "class", "api-warning svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, p, anchor);
			append_hydration(p, t);
		},
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (902:6) {:else}
function create_else_block(ctx) {
	let div1;
	let div0;
	let t0;
	let t1;
	let p;
	let t2;

	return {
		c() {
			div1 = element("div");
			div0 = element("div");
			t0 = text("🤖");
			t1 = space();
			p = element("p");
			t2 = text("Configure your API settings and fill out the form to generate a custom AI prompt using real AI models.");
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, "🤖");
			div0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			p = claim_element(div1_nodes, "P", { class: true });
			var p_nodes = children(p);
			t2 = claim_text(p_nodes, "Configure your API settings and fill out the form to generate a custom AI prompt using real AI models.");
			p_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "placeholder-icon svelte-1vwvqek");
			attr(p, "class", "svelte-1vwvqek");
			attr(div1, "class", "placeholder svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, div0);
			append_hydration(div0, t0);
			append_hydration(div1, t1);
			append_hydration(div1, p);
			append_hydration(p, t2);
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(div1);
		}
	};
}

// (890:6) {#if generatedPrompt}
function create_if_block(ctx) {
	let div2;
	let div0;
	let span;
	let t0;
	let t1;
	let button;
	let t2;
	let t3;
	let div1;
	let t4;
	let mounted;
	let dispose;

	return {
		c() {
			div2 = element("div");
			div0 = element("div");
			span = element("span");
			t0 = text("Ready to use AI Prompt:");
			t1 = space();
			button = element("button");
			t2 = text("📋 Copy");
			t3 = space();
			div1 = element("div");
			t4 = text(/*generatedPrompt*/ ctx[8]);
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span = claim_element(div0_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t0 = claim_text(span_nodes, "Ready to use AI Prompt:");
			span_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			button = claim_element(div0_nodes, "BUTTON", { class: true });
			var button_nodes = children(button);
			t2 = claim_text(button_nodes, "📋 Copy");
			button_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			t4 = claim_text(div1_nodes, /*generatedPrompt*/ ctx[8]);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span, "class", "prompt-label svelte-1vwvqek");
			attr(button, "class", "copy-btn svelte-1vwvqek");
			attr(div0, "class", "prompt-header svelte-1vwvqek");
			attr(div1, "class", "prompt-text svelte-1vwvqek");
			attr(div2, "class", "prompt-display svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div0);
			append_hydration(div0, span);
			append_hydration(span, t0);
			append_hydration(div0, t1);
			append_hydration(div0, button);
			append_hydration(button, t2);
			append_hydration(div2, t3);
			append_hydration(div2, div1);
			append_hydration(div1, t4);

			if (!mounted) {
				dispose = listen(button, "click", /*click_handler_2*/ ctx[34]);
				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*generatedPrompt*/ 256) set_data(t4, /*generatedPrompt*/ ctx[8]);
		},
		d(detaching) {
			if (detaching) detach(div2);
			mounted = false;
			dispose();
		}
	};
}

function create_fragment(ctx) {
	let main;
	let div8;
	let div1;
	let div0;
	let t0;
	let t1;
	let h1;
	let t2;
	let t3;
	let button0;
	let t4;
	let t5;
	let t6;
	let div2;
	let label0;
	let t7;
	let t8;
	let select0;
	let option0;
	let t9;
	let t10;
	let div3;
	let label1;
	let t11;
	let t12;
	let input0;
	let input0_placeholder_value;
	let t13;
	let div4;
	let label2;
	let t14;
	let t15;
	let input1;
	let input1_placeholder_value;
	let t16;
	let div5;
	let label3;
	let t17;
	let t18;
	let select1;
	let option1;
	let t19;
	let t20;
	let div6;
	let label4;
	let t21;
	let t22;
	let textarea;
	let t23;
	let div7;
	let label5;
	let t24;
	let t25;
	let input2;
	let t26;
	let button1;
	let button1_disabled_value;
	let t27;
	let t28;
	let div10;
	let h2;
	let t29;
	let t30;
	let div9;
	let mounted;
	let dispose;
	let if_block0 = /*showApiConfig*/ ctx[13] && create_if_block_3(ctx);
	let each_value_1 = Object.keys(/*categories*/ ctx[17]);
	let each_blocks_1 = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks_1[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	let each_value = /*toneOptions*/ ctx[18];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	function select_block_type_1(ctx, dirty) {
		if (/*isGenerating*/ ctx[9]) return create_if_block_2;
		return create_else_block_1;
	}

	let current_block_type = select_block_type_1(ctx);
	let if_block1 = current_block_type(ctx);
	let if_block2 = !/*apiKey*/ ctx[12] && create_if_block_1();

	function select_block_type_2(ctx, dirty) {
		if (/*generatedPrompt*/ ctx[8]) return create_if_block;
		return create_else_block;
	}

	let current_block_type_1 = select_block_type_2(ctx);
	let if_block3 = current_block_type_1(ctx);

	return {
		c() {
			main = element("main");
			div8 = element("div");
			div1 = element("div");
			div0 = element("div");
			t0 = text("✨");
			t1 = space();
			h1 = element("h1");
			t2 = text("AI Prompt Generator");
			t3 = space();
			button0 = element("button");
			t4 = text("⚙️");
			t5 = space();
			if (if_block0) if_block0.c();
			t6 = space();
			div2 = element("div");
			label0 = element("label");
			t7 = text("1. Select Category");
			t8 = space();
			select0 = element("select");
			option0 = element("option");
			t9 = text("Choose a category...");

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].c();
			}

			t10 = space();
			div3 = element("div");
			label1 = element("label");
			t11 = text("2. What is your main objective?");
			t12 = space();
			input0 = element("input");
			t13 = space();
			div4 = element("div");
			label2 = element("label");
			t14 = text("3. Target audience or context");
			t15 = space();
			input1 = element("input");
			t16 = space();
			div5 = element("div");
			label3 = element("label");
			t17 = text("4. Choose a tone");
			t18 = space();
			select1 = element("select");
			option1 = element("option");
			t19 = text("Select tone...");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t20 = space();
			div6 = element("div");
			label4 = element("label");
			t21 = text("5. Specific requirements or constraints");
			t22 = space();
			textarea = element("textarea");
			t23 = space();
			div7 = element("div");
			label5 = element("label");
			t24 = text("6. Preferred output format");
			t25 = space();
			input2 = element("input");
			t26 = space();
			button1 = element("button");
			if_block1.c();
			t27 = space();
			if (if_block2) if_block2.c();
			t28 = space();
			div10 = element("div");
			h2 = element("h2");
			t29 = text("Generated AI Prompt");
			t30 = space();
			div9 = element("div");
			if_block3.c();
			this.h();
		},
		l(nodes) {
			main = claim_element(nodes, "MAIN", { class: true });
			var main_nodes = children(main);
			div8 = claim_element(main_nodes, "DIV", { class: true });
			var div8_nodes = children(div8);
			div1 = claim_element(div8_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			t0 = claim_text(div0_nodes, "✨");
			div0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			h1 = claim_element(div1_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t2 = claim_text(h1_nodes, "AI Prompt Generator");
			h1_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			button0 = claim_element(div1_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t4 = claim_text(button0_nodes, "⚙️");
			button0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			t5 = claim_space(div8_nodes);
			if (if_block0) if_block0.l(div8_nodes);
			t6 = claim_space(div8_nodes);
			div2 = claim_element(div8_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			label0 = claim_element(div2_nodes, "LABEL", { for: true, class: true });
			var label0_nodes = children(label0);
			t7 = claim_text(label0_nodes, "1. Select Category");
			label0_nodes.forEach(detach);
			t8 = claim_space(div2_nodes);
			select0 = claim_element(div2_nodes, "SELECT", { id: true, class: true });
			var select0_nodes = children(select0);
			option0 = claim_element(select0_nodes, "OPTION", {});
			var option0_nodes = children(option0);
			t9 = claim_text(option0_nodes, "Choose a category...");
			option0_nodes.forEach(detach);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				each_blocks_1[i].l(select0_nodes);
			}

			select0_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			t10 = claim_space(div8_nodes);
			div3 = claim_element(div8_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			label1 = claim_element(div3_nodes, "LABEL", { for: true, class: true });
			var label1_nodes = children(label1);
			t11 = claim_text(label1_nodes, "2. What is your main objective?");
			label1_nodes.forEach(detach);
			t12 = claim_space(div3_nodes);

			input0 = claim_element(div3_nodes, "INPUT", {
				id: true,
				type: true,
				placeholder: true,
				class: true
			});

			div3_nodes.forEach(detach);
			t13 = claim_space(div8_nodes);
			div4 = claim_element(div8_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			label2 = claim_element(div4_nodes, "LABEL", { for: true, class: true });
			var label2_nodes = children(label2);
			t14 = claim_text(label2_nodes, "3. Target audience or context");
			label2_nodes.forEach(detach);
			t15 = claim_space(div4_nodes);

			input1 = claim_element(div4_nodes, "INPUT", {
				id: true,
				type: true,
				placeholder: true,
				class: true
			});

			div4_nodes.forEach(detach);
			t16 = claim_space(div8_nodes);
			div5 = claim_element(div8_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			label3 = claim_element(div5_nodes, "LABEL", { for: true, class: true });
			var label3_nodes = children(label3);
			t17 = claim_text(label3_nodes, "4. Choose a tone");
			label3_nodes.forEach(detach);
			t18 = claim_space(div5_nodes);
			select1 = claim_element(div5_nodes, "SELECT", { id: true, class: true });
			var select1_nodes = children(select1);
			option1 = claim_element(select1_nodes, "OPTION", {});
			var option1_nodes = children(option1);
			t19 = claim_text(option1_nodes, "Select tone...");
			option1_nodes.forEach(detach);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(select1_nodes);
			}

			select1_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			t20 = claim_space(div8_nodes);
			div6 = claim_element(div8_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			label4 = claim_element(div6_nodes, "LABEL", { for: true, class: true });
			var label4_nodes = children(label4);
			t21 = claim_text(label4_nodes, "5. Specific requirements or constraints");
			label4_nodes.forEach(detach);
			t22 = claim_space(div6_nodes);

			textarea = claim_element(div6_nodes, "TEXTAREA", {
				id: true,
				placeholder: true,
				rows: true,
				class: true
			});

			children(textarea).forEach(detach);
			div6_nodes.forEach(detach);
			t23 = claim_space(div8_nodes);
			div7 = claim_element(div8_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			label5 = claim_element(div7_nodes, "LABEL", { for: true, class: true });
			var label5_nodes = children(label5);
			t24 = claim_text(label5_nodes, "6. Preferred output format");
			label5_nodes.forEach(detach);
			t25 = claim_space(div7_nodes);

			input2 = claim_element(div7_nodes, "INPUT", {
				id: true,
				type: true,
				placeholder: true,
				class: true
			});

			div7_nodes.forEach(detach);
			t26 = claim_space(div8_nodes);
			button1 = claim_element(div8_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			if_block1.l(button1_nodes);
			button1_nodes.forEach(detach);
			t27 = claim_space(div8_nodes);
			if (if_block2) if_block2.l(div8_nodes);
			div8_nodes.forEach(detach);
			t28 = claim_space(main_nodes);
			div10 = claim_element(main_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			h2 = claim_element(div10_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t29 = claim_text(h2_nodes, "Generated AI Prompt");
			h2_nodes.forEach(detach);
			t30 = claim_space(div10_nodes);
			div9 = claim_element(div10_nodes, "DIV", { class: true });
			var div9_nodes = children(div9);
			if_block3.l(div9_nodes);
			div9_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			main_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(div0, "class", "icon svelte-1vwvqek");
			attr(h1, "class", "svelte-1vwvqek");
			attr(button0, "class", "config-btn svelte-1vwvqek");
			attr(div1, "class", "header svelte-1vwvqek");
			attr(label0, "for", "category");
			attr(label0, "class", "svelte-1vwvqek");
			option0.__value = "";
			option0.value = option0.__value;
			attr(select0, "id", "category");
			attr(select0, "class", "svelte-1vwvqek");
			if (/*selectedCategory*/ ctx[0] === void 0) add_render_callback(() => /*select0_change_handler_1*/ ctx[28].call(select0));
			attr(div2, "class", "form-group svelte-1vwvqek");
			attr(label1, "for", "objective");
			attr(label1, "class", "svelte-1vwvqek");
			attr(input0, "id", "objective");
			attr(input0, "type", "text");

			attr(input0, "placeholder", input0_placeholder_value = /*selectedCategory*/ ctx[0]
			? /*categories*/ ctx[17][/*selectedCategory*/ ctx[0]].objectivePlaceholder
			: 'e.g., Write a product description for a new smartwatch');

			attr(input0, "class", "svelte-1vwvqek");
			attr(div3, "class", "form-group svelte-1vwvqek");
			attr(label2, "for", "audience");
			attr(label2, "class", "svelte-1vwvqek");
			attr(input1, "id", "audience");
			attr(input1, "type", "text");

			attr(input1, "placeholder", input1_placeholder_value = /*selectedCategory*/ ctx[0]
			? /*categories*/ ctx[17][/*selectedCategory*/ ctx[0]].audiencePlaceholder
			: 'e.g., Tech-savvy consumers aged 25-40');

			attr(input1, "class", "svelte-1vwvqek");
			attr(div4, "class", "form-group svelte-1vwvqek");
			attr(label3, "for", "tone");
			attr(label3, "class", "svelte-1vwvqek");
			option1.__value = "";
			option1.value = option1.__value;
			attr(select1, "id", "tone");
			attr(select1, "class", "svelte-1vwvqek");
			if (/*selectedTone*/ ctx[5] === void 0) add_render_callback(() => /*select1_change_handler_1*/ ctx[31].call(select1));
			attr(div5, "class", "form-group svelte-1vwvqek");
			attr(label4, "for", "requirements");
			attr(label4, "class", "svelte-1vwvqek");
			attr(textarea, "id", "requirements");
			attr(textarea, "placeholder", "e.g., Include key features, mention price range, highlight durability");
			attr(textarea, "rows", "3");
			attr(textarea, "class", "svelte-1vwvqek");
			attr(div6, "class", "form-group svelte-1vwvqek");
			attr(label5, "for", "format");
			attr(label5, "class", "svelte-1vwvqek");
			attr(input2, "id", "format");
			attr(input2, "type", "text");
			attr(input2, "placeholder", "e.g., Bullet points, paragraph form, JSON structure");
			attr(input2, "class", "svelte-1vwvqek");
			attr(div7, "class", "form-group svelte-1vwvqek");
			attr(button1, "class", "generate-btn svelte-1vwvqek");
			button1.disabled = button1_disabled_value = /*isGenerating*/ ctx[9] || !/*apiKey*/ ctx[12];
			attr(div8, "class", "form-section svelte-1vwvqek");
			attr(h2, "class", "svelte-1vwvqek");
			attr(div9, "class", "output-content svelte-1vwvqek");
			attr(div10, "class", "output-section svelte-1vwvqek");
			attr(main, "class", "container svelte-1vwvqek");
		},
		m(target, anchor) {
			insert_hydration(target, main, anchor);
			append_hydration(main, div8);
			append_hydration(div8, div1);
			append_hydration(div1, div0);
			append_hydration(div0, t0);
			append_hydration(div1, t1);
			append_hydration(div1, h1);
			append_hydration(h1, t2);
			append_hydration(div1, t3);
			append_hydration(div1, button0);
			append_hydration(button0, t4);
			append_hydration(div8, t5);
			if (if_block0) if_block0.m(div8, null);
			append_hydration(div8, t6);
			append_hydration(div8, div2);
			append_hydration(div2, label0);
			append_hydration(label0, t7);
			append_hydration(div2, t8);
			append_hydration(div2, select0);
			append_hydration(select0, option0);
			append_hydration(option0, t9);

			for (let i = 0; i < each_blocks_1.length; i += 1) {
				if (each_blocks_1[i]) {
					each_blocks_1[i].m(select0, null);
				}
			}

			select_option(select0, /*selectedCategory*/ ctx[0], true);
			append_hydration(div8, t10);
			append_hydration(div8, div3);
			append_hydration(div3, label1);
			append_hydration(label1, t11);
			append_hydration(div3, t12);
			append_hydration(div3, input0);
			set_input_value(input0, /*mainObjective*/ ctx[3]);
			append_hydration(div8, t13);
			append_hydration(div8, div4);
			append_hydration(div4, label2);
			append_hydration(label2, t14);
			append_hydration(div4, t15);
			append_hydration(div4, input1);
			set_input_value(input1, /*targetAudience*/ ctx[4]);
			append_hydration(div8, t16);
			append_hydration(div8, div5);
			append_hydration(div5, label3);
			append_hydration(label3, t17);
			append_hydration(div5, t18);
			append_hydration(div5, select1);
			append_hydration(select1, option1);
			append_hydration(option1, t19);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(select1, null);
				}
			}

			select_option(select1, /*selectedTone*/ ctx[5], true);
			append_hydration(div8, t20);
			append_hydration(div8, div6);
			append_hydration(div6, label4);
			append_hydration(label4, t21);
			append_hydration(div6, t22);
			append_hydration(div6, textarea);
			set_input_value(textarea, /*specificRequirements*/ ctx[6]);
			append_hydration(div8, t23);
			append_hydration(div8, div7);
			append_hydration(div7, label5);
			append_hydration(label5, t24);
			append_hydration(div7, t25);
			append_hydration(div7, input2);
			set_input_value(input2, /*outputFormat*/ ctx[7]);
			append_hydration(div8, t26);
			append_hydration(div8, button1);
			if_block1.m(button1, null);
			append_hydration(div8, t27);
			if (if_block2) if_block2.m(div8, null);
			append_hydration(main, t28);
			append_hydration(main, div10);
			append_hydration(div10, h2);
			append_hydration(h2, t29);
			append_hydration(div10, t30);
			append_hydration(div10, div9);
			if_block3.m(div9, null);

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler*/ ctx[23]),
					listen(select0, "change", /*select0_change_handler_1*/ ctx[28]),
					listen(input0, "input", /*input0_input_handler*/ ctx[29]),
					listen(input1, "input", /*input1_input_handler*/ ctx[30]),
					listen(select1, "change", /*select1_change_handler_1*/ ctx[31]),
					listen(textarea, "input", /*textarea_input_handler*/ ctx[32]),
					listen(input2, "input", /*input2_input_handler*/ ctx[33]),
					listen(button1, "click", /*generatePromptWithAI*/ ctx[20])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (/*showApiConfig*/ ctx[13]) {
				if (if_block0) {
					if_block0.p(ctx, dirty);
				} else {
					if_block0 = create_if_block_3(ctx);
					if_block0.c();
					if_block0.m(div8, t6);
				}
			} else if (if_block0) {
				if_block0.d(1);
				if_block0 = null;
			}

			if (dirty[0] & /*categories*/ 131072) {
				each_value_1 = Object.keys(/*categories*/ ctx[17]);
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks_1[i]) {
						each_blocks_1[i].p(child_ctx, dirty);
					} else {
						each_blocks_1[i] = create_each_block_1(child_ctx);
						each_blocks_1[i].c();
						each_blocks_1[i].m(select0, null);
					}
				}

				for (; i < each_blocks_1.length; i += 1) {
					each_blocks_1[i].d(1);
				}

				each_blocks_1.length = each_value_1.length;
			}

			if (dirty[0] & /*selectedCategory, categories*/ 131073) {
				select_option(select0, /*selectedCategory*/ ctx[0]);
			}

			if (dirty[0] & /*selectedCategory, categories*/ 131073 && input0_placeholder_value !== (input0_placeholder_value = /*selectedCategory*/ ctx[0]
			? /*categories*/ ctx[17][/*selectedCategory*/ ctx[0]].objectivePlaceholder
			: 'e.g., Write a product description for a new smartwatch')) {
				attr(input0, "placeholder", input0_placeholder_value);
			}

			if (dirty[0] & /*mainObjective*/ 8 && input0.value !== /*mainObjective*/ ctx[3]) {
				set_input_value(input0, /*mainObjective*/ ctx[3]);
			}

			if (dirty[0] & /*selectedCategory, categories*/ 131073 && input1_placeholder_value !== (input1_placeholder_value = /*selectedCategory*/ ctx[0]
			? /*categories*/ ctx[17][/*selectedCategory*/ ctx[0]].audiencePlaceholder
			: 'e.g., Tech-savvy consumers aged 25-40')) {
				attr(input1, "placeholder", input1_placeholder_value);
			}

			if (dirty[0] & /*targetAudience*/ 16 && input1.value !== /*targetAudience*/ ctx[4]) {
				set_input_value(input1, /*targetAudience*/ ctx[4]);
			}

			if (dirty[0] & /*toneOptions*/ 262144) {
				each_value = /*toneOptions*/ ctx[18];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(select1, null);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (dirty[0] & /*selectedTone, toneOptions*/ 262176) {
				select_option(select1, /*selectedTone*/ ctx[5]);
			}

			if (dirty[0] & /*specificRequirements*/ 64) {
				set_input_value(textarea, /*specificRequirements*/ ctx[6]);
			}

			if (dirty[0] & /*outputFormat*/ 128 && input2.value !== /*outputFormat*/ ctx[7]) {
				set_input_value(input2, /*outputFormat*/ ctx[7]);
			}

			if (current_block_type !== (current_block_type = select_block_type_1(ctx))) {
				if_block1.d(1);
				if_block1 = current_block_type(ctx);

				if (if_block1) {
					if_block1.c();
					if_block1.m(button1, null);
				}
			}

			if (dirty[0] & /*isGenerating, apiKey*/ 4608 && button1_disabled_value !== (button1_disabled_value = /*isGenerating*/ ctx[9] || !/*apiKey*/ ctx[12])) {
				button1.disabled = button1_disabled_value;
			}

			if (!/*apiKey*/ ctx[12]) {
				if (if_block2) ; else {
					if_block2 = create_if_block_1();
					if_block2.c();
					if_block2.m(div8, null);
				}
			} else if (if_block2) {
				if_block2.d(1);
				if_block2 = null;
			}

			if (current_block_type_1 === (current_block_type_1 = select_block_type_2(ctx)) && if_block3) {
				if_block3.p(ctx, dirty);
			} else {
				if_block3.d(1);
				if_block3 = current_block_type_1(ctx);

				if (if_block3) {
					if_block3.c();
					if_block3.m(div9, null);
				}
			}
		},
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(main);
			if (if_block0) if_block0.d();
			destroy_each(each_blocks_1, detaching);
			destroy_each(each_blocks, detaching);
			if_block1.d();
			if (if_block2) if_block2.d();
			if_block3.d();
			mounted = false;
			run_all(dispose);
		}
	};
}

function instance($$self, $$props, $$invalidate) {
	let availableModels;
	let { props } = $$props;
	let selectedCategory = '';
	let mainObjective = '';
	let targetAudience = '';
	let selectedTone = '';
	let specificRequirements = '';
	let outputFormat = '';
	let generatedPrompt = '';
	let isGenerating = false;
	let isTestingAPI = false;
	let testResult = '';

	// API Configuration
	let apiProvider = 'openai';

	let apiKey = '';
	let apiModel = 'gpt-3.5-turbo';
	let showApiConfig = false;

	const apiLinks = {
		openai: 'https://platform.openai.com/api-keys',
		anthropic: 'https://console.anthropic.com/',
		google: 'https://makersuite.google.com/app/apikey'
	};

	const apiProviders = {
		openai: {
			name: 'OpenAI',
			models: ['gpt-3.5-turbo', 'gpt-4', 'gpt-4-turbo'],
			endpoint: 'https://api.openai.com/v1/chat/completions'
		},
		anthropic: {
			name: 'Anthropic (Claude)',
			models: [
				'claude-3-haiku-20240307',
				'claude-3-sonnet-20240229',
				'claude-3-opus-20240229'
			],
			endpoint: 'https://api.anthropic.com/v1/messages'
		},
		google: {
			name: 'Google (Gemini)',
			models: ['gemini-2.5-flash', 'gemini-2.5-pro', 'gemini-pro'],
			endpoint: 'https://generativelanguage.googleapis.com/v1beta/models'
		}
	};

	const categories = {
		'Business/Marketing': {
			objectivePlaceholder: 'e.g., Create a marketing campaign for a new product launch',
			audiencePlaceholder: 'e.g., Small business owners aged 30-50',
			defaultTone: 'Professional',
			defaultRequirements: 'Include call-to-action, focus on benefits, mention target metrics',
			defaultFormat: 'Structured outline with bullet points and key messaging'
		},
		'Creative Writing': {
			objectivePlaceholder: 'e.g., Write a short story about time travel',
			audiencePlaceholder: 'e.g., Young adult readers interested in sci-fi',
			defaultTone: 'Creative',
			defaultRequirements: 'Include character development, engaging plot, vivid descriptions',
			defaultFormat: 'Narrative format with dialogue and descriptive passages'
		},
		'Educational': {
			objectivePlaceholder: 'e.g., Explain quantum physics concepts for beginners',
			audiencePlaceholder: 'e.g., High school students with basic science knowledge',
			defaultTone: 'Educational',
			defaultRequirements: 'Use simple analogies, include examples, break down complex concepts',
			defaultFormat: 'Step-by-step explanation with examples and key takeaways'
		},
		'General AI Assistant': {
			objectivePlaceholder: 'e.g., Help plan a weekly meal prep routine',
			audiencePlaceholder: 'e.g., Busy professionals looking for healthy options',
			defaultTone: 'Helpful',
			defaultRequirements: 'Provide practical advice, consider time constraints, include alternatives',
			defaultFormat: 'Organized list with clear instructions and tips'
		},
		'Image Generation': {
			objectivePlaceholder: 'e.g., Create a logo design for a tech startup',
			audiencePlaceholder: 'e.g., Modern tech company targeting millennials',
			defaultTone: 'Descriptive',
			defaultRequirements: 'Specify style, colors, composition, mood, and visual elements',
			defaultFormat: 'Detailed visual description with artistic direction'
		},
		'Technical/Coding': {
			objectivePlaceholder: 'e.g., Write a Python function for data validation',
			audiencePlaceholder: 'e.g., Junior developers learning backend development',
			defaultTone: 'Technical',
			defaultRequirements: 'Include error handling, comments, follow best practices',
			defaultFormat: 'Code with documentation and usage examples'
		},
		'Video (VEO 3 AI)': {
			objectivePlaceholder: 'e.g., Create a product demo video showing app features',
			audiencePlaceholder: 'e.g., Potential customers evaluating software solutions',
			defaultTone: 'Engaging',
			defaultRequirements: 'Define scenes, characters, camera angles, transitions, duration',
			defaultFormat: 'Scene-by-scene breakdown with visual and audio descriptions'
		}
	};

	const toneOptions = [
		'Professional',
		'Creative',
		'Educational',
		'Helpful',
		'Descriptive',
		'Technical',
		'Engaging',
		'Casual',
		'Formal',
		'Conversational'
	];

	async function testAPIConnection() {
		if (!apiKey) {
			$$invalidate(11, testResult = 'Please enter an API key first');
			return;
		}

		$$invalidate(10, isTestingAPI = true);
		$$invalidate(11, testResult = '');

		try {
			const testPrompt = "Say 'API connection successful' in a friendly way.";
			const response = await callAIAPI("You are a helpful assistant.", testPrompt);
			$$invalidate(11, testResult = '✅ API connection successful!');
		} catch(error) {
			$$invalidate(11, testResult = `❌ API test failed: ${error.message}`);
		} finally {
			$$invalidate(10, isTestingAPI = false);
		}
	}

	async function generatePromptWithAI() {
		if (!selectedCategory || !mainObjective) {
			alert('Please fill in at least the category and main objective.');
			return;
		}

		if (!apiKey) {
			alert('Please enter your API key in the configuration.');
			return;
		}

		$$invalidate(9, isGenerating = true);

		try {
			const systemPrompt = `You are an expert AI prompt engineer. Your task is to create a highly effective, detailed prompt based on the user's requirements. The prompt should be clear, specific, and optimized for getting the best results from AI models.

Create a professional AI prompt that incorporates all the provided details. Make the prompt actionable and specific. Format it as a single, well-structured prompt that can be directly used with AI models.`;

			const userPrompt = `Create an AI prompt with these specifications:

Category: ${selectedCategory}
Main Objective: ${mainObjective}
Target Audience: ${targetAudience || 'General audience'}
Tone: ${selectedTone || 'Professional'}
Requirements: ${specificRequirements || 'Standard quality output'}
Output Format: ${outputFormat || 'Clear and organized response'}

Please generate a comprehensive, well-crafted AI prompt that incorporates all these elements effectively.`;

			const response = await callAIAPI(systemPrompt, userPrompt);
			$$invalidate(8, generatedPrompt = response);
		} catch(error) {
			console.error('Error generating prompt:', error);
			$$invalidate(8, generatedPrompt = `Error generating prompt: ${error.message}. Please check your API configuration and try again.`);
		} finally {
			$$invalidate(9, isGenerating = false);
		}
	}

	async function callAIAPI(systemPrompt, userPrompt) {
		switch (apiProvider) {
			case 'openai':
				return await callOpenAI(systemPrompt, userPrompt);
			case 'anthropic':
				return await callAnthropic(systemPrompt, userPrompt);
			case 'google':
				return await callGoogle(systemPrompt, userPrompt);
			default:
				throw new Error('Unsupported API provider');
		}
	}

	async function callOpenAI(systemPrompt, userPrompt) {
		const response = await fetch('https://api.openai.com/v1/chat/completions', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'Authorization': `Bearer ${apiKey}`
			},
			body: JSON.stringify({
				model: apiModel,
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: userPrompt }
				],
				max_tokens: 1000,
				temperature: 0.7
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || 'OpenAI API request failed');
		}

		const data = await response.json();
		return data.choices[0].message.content;
	}

	async function callAnthropic(systemPrompt, userPrompt) {
		const response = await fetch('https://api.anthropic.com/v1/messages', {
			method: 'POST',
			headers: {
				'Content-Type': 'application/json',
				'x-api-key': apiKey,
				'anthropic-version': '2023-06-01'
			},
			body: JSON.stringify({
				model: apiModel,
				max_tokens: 1000,
				system: systemPrompt,
				messages: [{ role: 'user', content: userPrompt }]
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || 'Anthropic API request failed');
		}

		const data = await response.json();
		return data.content[0].text;
	}

	async function callGoogle(systemPrompt, userPrompt) {
		const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${apiModel}:generateContent?key=${apiKey}`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				contents: [
					{
						parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }]
					}
				],
				generationConfig: { maxOutputTokens: 1000, temperature: 0.7 }
			})
		});

		if (!response.ok) {
			const error = await response.json();
			throw new Error(error.error?.message || 'Google API request failed');
		}

		const data = await response.json();

		// Better error handling for Google API response
		if (!data.candidates || data.candidates.length === 0) {
			throw new Error('No response generated from Google API');
		}

		if (!data.candidates[0].content || !data.candidates[0].content.parts || data.candidates[0].content.parts.length === 0) {
			throw new Error('Invalid response format from Google API');
		}

		return data.candidates[0].content.parts[0].text;
	}

	// Load API config from localStorage
	onMount(() => {
		const savedConfig = localStorage.getItem('aiPromptGeneratorConfig');

		if (savedConfig) {
			const config = JSON.parse(savedConfig);
			$$invalidate(1, apiProvider = config.apiProvider || 'openai');
			$$invalidate(12, apiKey = config.apiKey || '');

			// Set default model based on provider
			if (config.apiProvider === 'google') {
				$$invalidate(2, apiModel = config.apiModel || 'gemini-2.5-flash');
			} else if (config.apiProvider === 'anthropic') {
				$$invalidate(2, apiModel = config.apiModel || 'claude-3-haiku-20240307');
			} else {
				$$invalidate(2, apiModel = config.apiModel || 'gpt-3.5-turbo');
			}
		}
	});

	// Save API config to localStorage
	function saveConfig() {
		const config = { apiProvider, apiKey, apiModel };
		localStorage.setItem('aiPromptGeneratorConfig', JSON.stringify(config));
		$$invalidate(13, showApiConfig = false);
	}

	const click_handler = () => $$invalidate(13, showApiConfig = !showApiConfig);

	function select0_change_handler() {
		apiProvider = select_value(this);
		$$invalidate(1, apiProvider);
		$$invalidate(16, apiProviders);
	}

	function select1_change_handler() {
		apiModel = select_value(this);
		($$invalidate(2, apiModel), $$invalidate(1, apiProvider));
		($$invalidate(14, availableModels), $$invalidate(1, apiProvider));
	}

	function input_input_handler() {
		apiKey = this.value;
		$$invalidate(12, apiKey);
	}

	const click_handler_1 = () => $$invalidate(13, showApiConfig = false);

	function select0_change_handler_1() {
		selectedCategory = select_value(this);
		$$invalidate(0, selectedCategory);
		$$invalidate(17, categories);
	}

	function input0_input_handler() {
		mainObjective = this.value;
		$$invalidate(3, mainObjective);
	}

	function input1_input_handler() {
		targetAudience = this.value;
		$$invalidate(4, targetAudience);
	}

	function select1_change_handler_1() {
		selectedTone = select_value(this);
		($$invalidate(5, selectedTone), $$invalidate(0, selectedCategory));
		$$invalidate(18, toneOptions);
	}

	function textarea_input_handler() {
		specificRequirements = this.value;
		($$invalidate(6, specificRequirements), $$invalidate(0, selectedCategory));
	}

	function input2_input_handler() {
		outputFormat = this.value;
		($$invalidate(7, outputFormat), $$invalidate(0, selectedCategory));
	}

	const click_handler_2 = () => navigator.clipboard.writeText(generatedPrompt);

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(22, props = $$props.props);
	};

	$$self.$$.update = () => {
		if ($$self.$$.dirty[0] & /*selectedCategory*/ 1) {
			if (selectedCategory && categories[selectedCategory]) {
				const categoryData = categories[selectedCategory];
				$$invalidate(5, selectedTone = categoryData.defaultTone);
				$$invalidate(6, specificRequirements = categoryData.defaultRequirements);
				$$invalidate(7, outputFormat = categoryData.defaultFormat);
			}
		}

		if ($$self.$$.dirty[0] & /*apiProvider*/ 2) {
			$$invalidate(14, availableModels = apiProviders[apiProvider]?.models || []);
		}

		if ($$self.$$.dirty[0] & /*apiProvider, apiModel*/ 6) {
			if (apiProvider && !apiModel) {
				if (apiProvider === 'google') {
					$$invalidate(2, apiModel = 'gemini-2.5-flash');
				} else if (apiProvider === 'anthropic') {
					$$invalidate(2, apiModel = 'claude-3-haiku-20240307');
				} else {
					$$invalidate(2, apiModel = 'gpt-3.5-turbo');
				}
			}
		}
	};

	return [
		selectedCategory,
		apiProvider,
		apiModel,
		mainObjective,
		targetAudience,
		selectedTone,
		specificRequirements,
		outputFormat,
		generatedPrompt,
		isGenerating,
		isTestingAPI,
		testResult,
		apiKey,
		showApiConfig,
		availableModels,
		apiLinks,
		apiProviders,
		categories,
		toneOptions,
		testAPIConnection,
		generatePromptWithAI,
		saveConfig,
		props,
		click_handler,
		select0_change_handler,
		select1_change_handler,
		input_input_handler,
		click_handler_1,
		select0_change_handler_1,
		input0_input_handler,
		input1_input_handler,
		select1_change_handler_1,
		textarea_input_handler,
		input2_input_handler,
		click_handler_2
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 22 }, null, [-1, -1]);
	}
}

export { Component as default };
