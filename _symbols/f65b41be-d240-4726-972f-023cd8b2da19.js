// Music pLayer - Updated June 26, 2025
function noop() { }
function assign(tar, src) {
    // @ts-ignore
    for (const k in src)
        tar[k] = src[k];
    return tar;
}
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
let src_url_equal_anchor;
function src_url_equal(element_src, url) {
    if (!src_url_equal_anchor) {
        src_url_equal_anchor = document.createElement('a');
    }
    src_url_equal_anchor.href = url;
    return element_src === src_url_equal_anchor.href;
}
function is_empty(obj) {
    return Object.keys(obj).length === 0;
}
function create_slot(definition, ctx, $$scope, fn) {
    if (definition) {
        const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
        return definition[0](slot_ctx);
    }
}
function get_slot_context(definition, ctx, $$scope, fn) {
    return definition[1] && fn
        ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
        : $$scope.ctx;
}
function get_slot_changes(definition, $$scope, dirty, fn) {
    if (definition[2] && fn) {
        const lets = definition[2](fn(dirty));
        if ($$scope.dirty === undefined) {
            return lets;
        }
        if (typeof lets === 'object') {
            const merged = [];
            const len = Math.max($$scope.dirty.length, lets.length);
            for (let i = 0; i < len; i += 1) {
                merged[i] = $$scope.dirty[i] | lets[i];
            }
            return merged;
        }
        return $$scope.dirty | lets;
    }
    return $$scope.dirty;
}
function update_slot_base(slot, slot_definition, ctx, $$scope, slot_changes, get_slot_context_fn) {
    if (slot_changes) {
        const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
        slot.p(slot_context, slot_changes);
    }
}
function get_all_dirty_from_scope($$scope) {
    if ($$scope.ctx.length > 32) {
        const dirty = [];
        const length = $$scope.ctx.length / 32;
        for (let i = 0; i < length; i++) {
            dirty[i] = -1;
        }
        return dirty;
    }
    return -1;
}
function exclude_internal_props(props) {
    const result = {};
    for (const k in props)
        if (k[0] !== '$')
            result[k] = props[k];
    return result;
}
function compute_rest_props(props, keys) {
    const rest = {};
    keys = new Set(keys);
    for (const k in props)
        if (!keys.has(k) && k[0] !== '$')
            rest[k] = props[k];
    return rest;
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
function svg_element(name) {
    return document.createElementNS('http://www.w3.org/2000/svg', name);
}
function text(data) {
    return document.createTextNode(data);
}
function space() {
    return text(' ');
}
function empty() {
    return text('');
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
function set_svg_attributes(node, attributes) {
    for (const key in attributes) {
        attr(node, key, attributes[key]);
    }
}
function to_number(value) {
    return value === '' ? null : +value;
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
function claim_svg_element(nodes, name, attributes) {
    return claim_element_base(nodes, name, attributes, svg_element);
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
function set_style(node, key, value, important) {
    if (value == null) {
        node.style.removeProperty(key);
    }
    else {
        node.style.setProperty(key, value, important ? 'important' : '');
    }
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
let outros;
function group_outros() {
    outros = {
        r: 0,
        c: [],
        p: outros // parent group
    };
}
function check_outros() {
    if (!outros.r) {
        run_all(outros.c);
    }
    outros = outros.p;
}
function transition_in(block, local) {
    if (block && block.i) {
        outroing.delete(block);
        block.i(local);
    }
}
function transition_out(block, local, detach, callback) {
    if (block && block.o) {
        if (outroing.has(block))
            return;
        outroing.add(block);
        outros.c.push(() => {
            outroing.delete(block);
            if (callback) {
                if (detach)
                    block.d(1);
                callback();
            }
        });
        block.o(local);
    }
    else if (callback) {
        callback();
    }
}

function get_spread_update(levels, updates) {
    const update = {};
    const to_null_out = {};
    const accounted_for = { $$scope: 1 };
    let i = levels.length;
    while (i--) {
        const o = levels[i];
        const n = updates[i];
        if (n) {
            for (const key in o) {
                if (!(key in n))
                    to_null_out[key] = 1;
            }
            for (const key in n) {
                if (!accounted_for[key]) {
                    update[key] = n[key];
                    accounted_for[key] = 1;
                }
            }
            levels[i] = n;
        }
        else {
            for (const key in o) {
                accounted_for[key] = 1;
            }
        }
    }
    for (const key in to_null_out) {
        if (!(key in update))
            update[key] = undefined;
    }
    return update;
}
function get_spread_object(spread_props) {
    return typeof spread_props === 'object' && spread_props !== null ? spread_props : {};
}
function create_component(block) {
    block && block.c();
}
function claim_component(block, parent_nodes) {
    block && block.l(parent_nodes);
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

/**
 * @license lucide-svelte v0.523.0 - ISC
 *
 * ISC License
 * 
 * Copyright (c) for portions of Lucide are held by Cole Bemis 2013-2022 as part of Feather (MIT). All other copyright (c) for Lucide are held by Lucide Contributors 2022.
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 * 
 */
const defaultAttributes = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: 24,
    height: 24,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
};

/* generated by Svelte v3.59.1 */

function get_each_context$1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[11] = list[i][0];
	child_ctx[12] = list[i][1];
	return child_ctx;
}

// (35:4) <svelte:element this={tag} {...attrs}/>
function create_dynamic_element(ctx) {
	let svelte_element;
	let svelte_element_levels = [/*attrs*/ ctx[12]];
	let svelte_element_data = {};

	for (let i = 0; i < svelte_element_levels.length; i += 1) {
		svelte_element_data = assign(svelte_element_data, svelte_element_levels[i]);
	}

	return {
		c() {
			svelte_element = svg_element(/*tag*/ ctx[11]);
			this.h();
		},
		l(nodes) {
			svelte_element = claim_svg_element(nodes, /*tag*/ ctx[11], {});
			children(svelte_element).forEach(detach);
			this.h();
		},
		h() {
			set_svg_attributes(svelte_element, svelte_element_data);
		},
		m(target, anchor) {
			insert_hydration(target, svelte_element, anchor);
		},
		p(ctx, dirty) {
			set_svg_attributes(svelte_element, svelte_element_data = get_spread_update(svelte_element_levels, [dirty & /*iconNode*/ 32 && /*attrs*/ ctx[12]]));
		},
		d(detaching) {
			if (detaching) detach(svelte_element);
		}
	};
}

// (34:2) {#each iconNode as [tag, attrs]}
function create_each_block$1(ctx) {
	let previous_tag = /*tag*/ ctx[11];
	let svelte_element_anchor;
	let svelte_element = /*tag*/ ctx[11] && create_dynamic_element(ctx);

	return {
		c() {
			if (svelte_element) svelte_element.c();
			svelte_element_anchor = empty();
		},
		l(nodes) {
			if (svelte_element) svelte_element.l(nodes);
			svelte_element_anchor = empty();
		},
		m(target, anchor) {
			if (svelte_element) svelte_element.m(target, anchor);
			insert_hydration(target, svelte_element_anchor, anchor);
		},
		p(ctx, dirty) {
			if (/*tag*/ ctx[11]) {
				if (!previous_tag) {
					svelte_element = create_dynamic_element(ctx);
					previous_tag = /*tag*/ ctx[11];
					svelte_element.c();
					svelte_element.m(svelte_element_anchor.parentNode, svelte_element_anchor);
				} else if (safe_not_equal(previous_tag, /*tag*/ ctx[11])) {
					svelte_element.d(1);
					svelte_element = create_dynamic_element(ctx);
					previous_tag = /*tag*/ ctx[11];
					svelte_element.c();
					svelte_element.m(svelte_element_anchor.parentNode, svelte_element_anchor);
				} else {
					svelte_element.p(ctx, dirty);
				}
			} else if (previous_tag) {
				svelte_element.d(1);
				svelte_element = null;
				previous_tag = /*tag*/ ctx[11];
			}
		},
		d(detaching) {
			if (detaching) detach(svelte_element_anchor);
			if (svelte_element) svelte_element.d(detaching);
		}
	};
}

function create_fragment$d(ctx) {
	let svg;
	let each_1_anchor;
	let svg_stroke_width_value;
	let svg_class_value;
	let current;
	let each_value = /*iconNode*/ ctx[5];
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block$1(get_each_context$1(ctx, each_value, i));
	}

	const default_slot_template = /*#slots*/ ctx[10].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[9], null);

	let svg_levels = [
		defaultAttributes,
		/*$$restProps*/ ctx[7],
		{ width: /*size*/ ctx[2] },
		{ height: /*size*/ ctx[2] },
		{ stroke: /*color*/ ctx[1] },
		{
			"stroke-width": svg_stroke_width_value = /*absoluteStrokeWidth*/ ctx[4]
			? Number(/*strokeWidth*/ ctx[3]) * 24 / Number(/*size*/ ctx[2])
			: /*strokeWidth*/ ctx[3]
		},
		{
			class: svg_class_value = /*mergeClasses*/ ctx[6]('lucide-icon', 'lucide', /*name*/ ctx[0] ? `lucide-${/*name*/ ctx[0]}` : '', /*$$props*/ ctx[8].class)
		}
	];

	let svg_data = {};

	for (let i = 0; i < svg_levels.length; i += 1) {
		svg_data = assign(svg_data, svg_levels[i]);
	}

	return {
		c() {
			svg = svg_element("svg");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			each_1_anchor = empty();
			if (default_slot) default_slot.c();
			this.h();
		},
		l(nodes) {
			svg = claim_svg_element(nodes, "svg", {
				width: true,
				height: true,
				stroke: true,
				"stroke-width": true,
				class: true
			});

			var svg_nodes = children(svg);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(svg_nodes);
			}

			each_1_anchor = empty();
			if (default_slot) default_slot.l(svg_nodes);
			svg_nodes.forEach(detach);
			this.h();
		},
		h() {
			set_svg_attributes(svg, svg_data);
		},
		m(target, anchor) {
			insert_hydration(target, svg, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(svg, null);
				}
			}

			append_hydration(svg, each_1_anchor);

			if (default_slot) {
				default_slot.m(svg, null);
			}

			current = true;
		},
		p(ctx, [dirty]) {
			if (dirty & /*iconNode*/ 32) {
				each_value = /*iconNode*/ ctx[5];
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context$1(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
					} else {
						each_blocks[i] = create_each_block$1(child_ctx);
						each_blocks[i].c();
						each_blocks[i].m(svg, each_1_anchor);
					}
				}

				for (; i < each_blocks.length; i += 1) {
					each_blocks[i].d(1);
				}

				each_blocks.length = each_value.length;
			}

			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 512)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[9],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[9])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[9], dirty, null),
						null
					);
				}
			}

			set_svg_attributes(svg, svg_data = get_spread_update(svg_levels, [
				defaultAttributes,
				dirty & /*$$restProps*/ 128 && /*$$restProps*/ ctx[7],
				(!current || dirty & /*size*/ 4) && { width: /*size*/ ctx[2] },
				(!current || dirty & /*size*/ 4) && { height: /*size*/ ctx[2] },
				(!current || dirty & /*color*/ 2) && { stroke: /*color*/ ctx[1] },
				(!current || dirty & /*absoluteStrokeWidth, strokeWidth, size*/ 28 && svg_stroke_width_value !== (svg_stroke_width_value = /*absoluteStrokeWidth*/ ctx[4]
				? Number(/*strokeWidth*/ ctx[3]) * 24 / Number(/*size*/ ctx[2])
				: /*strokeWidth*/ ctx[3])) && { "stroke-width": svg_stroke_width_value },
				(!current || dirty & /*name, $$props*/ 257 && svg_class_value !== (svg_class_value = /*mergeClasses*/ ctx[6]('lucide-icon', 'lucide', /*name*/ ctx[0] ? `lucide-${/*name*/ ctx[0]}` : '', /*$$props*/ ctx[8].class))) && { class: svg_class_value }
			]));
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(svg);
			destroy_each(each_blocks, detaching);
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function instance$d($$self, $$props, $$invalidate) {
	const omit_props_names = ["name","color","size","strokeWidth","absoluteStrokeWidth","iconNode"];
	let $$restProps = compute_rest_props($$props, omit_props_names);
	let { $$slots: slots = {}, $$scope } = $$props;
	let { name = undefined } = $$props;
	let { color = 'currentColor' } = $$props;
	let { size = 24 } = $$props;
	let { strokeWidth = 2 } = $$props;
	let { absoluteStrokeWidth = false } = $$props;
	let { iconNode = [] } = $$props;

	const mergeClasses = (...classes) => classes.filter((className, index, array) => {
		return Boolean(className) && array.indexOf(className) === index;
	}).join(' ');

	$$self.$$set = $$new_props => {
		$$invalidate(8, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		$$invalidate(7, $$restProps = compute_rest_props($$props, omit_props_names));
		if ('name' in $$new_props) $$invalidate(0, name = $$new_props.name);
		if ('color' in $$new_props) $$invalidate(1, color = $$new_props.color);
		if ('size' in $$new_props) $$invalidate(2, size = $$new_props.size);
		if ('strokeWidth' in $$new_props) $$invalidate(3, strokeWidth = $$new_props.strokeWidth);
		if ('absoluteStrokeWidth' in $$new_props) $$invalidate(4, absoluteStrokeWidth = $$new_props.absoluteStrokeWidth);
		if ('iconNode' in $$new_props) $$invalidate(5, iconNode = $$new_props.iconNode);
		if ('$$scope' in $$new_props) $$invalidate(9, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);

	return [
		name,
		color,
		size,
		strokeWidth,
		absoluteStrokeWidth,
		iconNode,
		mergeClasses,
		$$restProps,
		$$props,
		$$scope,
		slots
	];
}

let Component$d = class Component extends SvelteComponent {
	constructor(options) {
		super();

		init(this, options, instance$d, create_fragment$d, safe_not_equal, {
			name: 0,
			color: 1,
			size: 2,
			strokeWidth: 3,
			absoluteStrokeWidth: 4,
			iconNode: 5
		});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$b(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$c(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "list" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$b] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$c($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		["path", { "d": "M3 12h.01" }],
		["path", { "d": "M3 18h.01" }],
		["path", { "d": "M3 6h.01" }],
		["path", { "d": "M8 12h13" }],
		["path", { "d": "M8 18h13" }],
		["path", { "d": "M8 6h13" }]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$c = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$c, create_fragment$c, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$a(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$b(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "pause" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$a] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$b($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		[
			"rect",
			{
				"x": "14",
				"y": "4",
				"width": "4",
				"height": "16",
				"rx": "1"
			}
		],
		[
			"rect",
			{
				"x": "6",
				"y": "4",
				"width": "4",
				"height": "16",
				"rx": "1"
			}
		]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$b = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$b, create_fragment$b, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$9(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$a(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "play" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$9] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$a($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	const iconNode = [["polygon", { "points": "6 3 20 12 6 21 6 3" }]];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$a = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$a, create_fragment$a, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$8(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$9(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "plus" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$8] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$9($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	const iconNode = [["path", { "d": "M5 12h14" }], ["path", { "d": "M12 5v14" }]];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$9 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$9, create_fragment$9, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$7(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$8(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "search" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$7] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$8($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		["path", { "d": "m21 21-4.34-4.34" }],
		["circle", { "cx": "11", "cy": "11", "r": "8" }]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$8 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$8, create_fragment$8, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$6(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$7(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "skip-back" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$6] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$7($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		["polygon", { "points": "19 20 9 12 19 4 19 20" }],
		[
			"line",
			{
				"x1": "5",
				"x2": "5",
				"y1": "19",
				"y2": "5"
			}
		]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$7 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$5(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$6(ctx) {
	let icon;
	let current;

	const icon_spread_levels = [
		{ name: "skip-forward" },
		/*$$props*/ ctx[1],
		{ iconNode: /*iconNode*/ ctx[0] }
	];

	let icon_props = {
		$$slots: { default: [create_default_slot$5] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$6($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		["polygon", { "points": "5 4 15 12 5 20 5 4" }],
		[
			"line",
			{
				"x1": "19",
				"x2": "19",
				"y1": "5",
				"y2": "19"
			}
		]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$6 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$4(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$5(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "trash-2" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$4] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$5($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		["path", { "d": "M3 6h18" }],
		[
			"path",
			{
				"d": "M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"
			}
		],
		[
			"path",
			{
				"d": "M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"
			}
		],
		[
			"line",
			{
				"x1": "10",
				"x2": "10",
				"y1": "11",
				"y2": "17"
			}
		],
		[
			"line",
			{
				"x1": "14",
				"x2": "14",
				"y1": "11",
				"y2": "17"
			}
		]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$5 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$5, create_fragment$5, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$3(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$4(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "volume-1" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$3] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$4($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		[
			"path",
			{
				"d": "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
			}
		],
		["path", { "d": "M16 9a5 5 0 0 1 0 6" }]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$4 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$4, create_fragment$4, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$2(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$3(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "volume-2" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$2] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$3($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		[
			"path",
			{
				"d": "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
			}
		],
		["path", { "d": "M16 9a5 5 0 0 1 0 6" }],
		["path", { "d": "M19.364 18.364a9 9 0 0 0 0-12.728" }]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$3 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$3, create_fragment$3, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot$1(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$2(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "volume-x" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot$1] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$2($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;

	const iconNode = [
		[
			"path",
			{
				"d": "M11 4.702a.705.705 0 0 0-1.203-.498L6.413 7.587A1.4 1.4 0 0 1 5.416 8H3a1 1 0 0 0-1 1v6a1 1 0 0 0 1 1h2.416a1.4 1.4 0 0 1 .997.413l3.383 3.384A.705.705 0 0 0 11 19.298z"
			}
		],
		[
			"line",
			{
				"x1": "22",
				"x2": "16",
				"y1": "9",
				"y2": "15"
			}
		],
		[
			"line",
			{
				"x1": "16",
				"x2": "22",
				"y1": "9",
				"y2": "15"
			}
		]
	];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$2 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$2, create_fragment$2, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function create_default_slot(ctx) {
	let current;
	const default_slot_template = /*#slots*/ ctx[2].default;
	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[3], null);

	return {
		c() {
			if (default_slot) default_slot.c();
		},
		l(nodes) {
			if (default_slot) default_slot.l(nodes);
		},
		m(target, anchor) {
			if (default_slot) {
				default_slot.m(target, anchor);
			}

			current = true;
		},
		p(ctx, dirty) {
			if (default_slot) {
				if (default_slot.p && (!current || dirty & /*$$scope*/ 8)) {
					update_slot_base(
						default_slot,
						default_slot_template,
						ctx,
						/*$$scope*/ ctx[3],
						!current
						? get_all_dirty_from_scope(/*$$scope*/ ctx[3])
						: get_slot_changes(default_slot_template, /*$$scope*/ ctx[3], dirty, null),
						null
					);
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(default_slot, local);
			current = true;
		},
		o(local) {
			transition_out(default_slot, local);
			current = false;
		},
		d(detaching) {
			if (default_slot) default_slot.d(detaching);
		}
	};
}

function create_fragment$1(ctx) {
	let icon;
	let current;
	const icon_spread_levels = [{ name: "x" }, /*$$props*/ ctx[1], { iconNode: /*iconNode*/ ctx[0] }];

	let icon_props = {
		$$slots: { default: [create_default_slot] },
		$$scope: { ctx }
	};

	for (let i = 0; i < icon_spread_levels.length; i += 1) {
		icon_props = assign(icon_props, icon_spread_levels[i]);
	}

	icon = new Component$d({ props: icon_props });

	return {
		c() {
			create_component(icon.$$.fragment);
		},
		l(nodes) {
			claim_component(icon.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(icon, target, anchor);
			current = true;
		},
		p(ctx, [dirty]) {
			const icon_changes = (dirty & /*$$props, iconNode*/ 3)
			? get_spread_update(icon_spread_levels, [
					icon_spread_levels[0],
					dirty & /*$$props*/ 2 && get_spread_object(/*$$props*/ ctx[1]),
					dirty & /*iconNode*/ 1 && { iconNode: /*iconNode*/ ctx[0] }
				])
			: {};

			if (dirty & /*$$scope*/ 8) {
				icon_changes.$$scope = { dirty, ctx };
			}

			icon.$set(icon_changes);
		},
		i(local) {
			if (current) return;
			transition_in(icon.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(icon.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(icon, detaching);
		}
	};
}

function instance$1($$self, $$props, $$invalidate) {
	let { $$slots: slots = {}, $$scope } = $$props;
	const iconNode = [["path", { "d": "M18 6 6 18" }], ["path", { "d": "m6 6 12 12" }]];

	$$self.$$set = $$new_props => {
		$$invalidate(1, $$props = assign(assign({}, $$props), exclude_internal_props($$new_props)));
		if ('$$scope' in $$new_props) $$invalidate(3, $$scope = $$new_props.$$scope);
	};

	$$props = exclude_internal_props($$props);
	return [iconNode, $$props, slots, $$scope];
}

let Component$1 = class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});
	}
};

/* generated by Svelte v3.59.1 */

function get_each_context(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[78] = list[i];
	return child_ctx;
}

function get_each_context_1(ctx, list, i) {
	const child_ctx = ctx.slice();
	child_ctx[81] = list[i];
	child_ctx[83] = i;
	return child_ctx;
}

// (1442:8) {:else}
function create_else_block_1(ctx) {
	let play;
	let current;
	play = new Component$a({ props: { size: 30 } });

	return {
		c() {
			create_component(play.$$.fragment);
		},
		l(nodes) {
			claim_component(play.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(play, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(play.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(play.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(play, detaching);
		}
	};
}

// (1440:8) {#if isPlaying}
function create_if_block_8(ctx) {
	let pause;
	let current;
	pause = new Component$b({ props: { size: 30 } });

	return {
		c() {
			create_component(pause.$$.fragment);
		},
		l(nodes) {
			claim_component(pause.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(pause, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(pause.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(pause.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(pause, detaching);
		}
	};
}

// (1477:4) {:else}
function create_else_block(ctx) {
	let volume2;
	let current;
	volume2 = new Component$3({ props: { size: 20 } });

	return {
		c() {
			create_component(volume2.$$.fragment);
		},
		l(nodes) {
			claim_component(volume2.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(volume2, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(volume2.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(volume2.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(volume2, detaching);
		}
	};
}

// (1475:26) 
function create_if_block_7(ctx) {
	let volume1;
	let current;
	volume1 = new Component$4({ props: { size: 20 } });

	return {
		c() {
			create_component(volume1.$$.fragment);
		},
		l(nodes) {
			claim_component(volume1.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(volume1, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(volume1.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(volume1.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(volume1, detaching);
		}
	};
}

// (1473:4) {#if volume === 0}
function create_if_block_6(ctx) {
	let volumex;
	let current;
	volumex = new Component$2({ props: { size: 20 } });

	return {
		c() {
			create_component(volumex.$$.fragment);
		},
		l(nodes) {
			claim_component(volumex.$$.fragment, nodes);
		},
		m(target, anchor) {
			mount_component(volumex, target, anchor);
			current = true;
		},
		i(local) {
			if (current) return;
			transition_in(volumex.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(volumex.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			destroy_component(volumex, detaching);
		}
	};
}

// (1506:8) {#each playlist as track, index}
function create_each_block_1(ctx) {
	let li;
	let div;
	let button0;
	let t0_value = /*track*/ ctx[81].title + "";
	let t0;
	let t1;
	let span;
	let t2_value = /*track*/ ctx[81].artist + "";
	let t2;
	let t3;
	let button1;
	let trash2;
	let t4;
	let current;
	let mounted;
	let dispose;

	function click_handler() {
		return /*click_handler*/ ctx[34](/*track*/ ctx[81]);
	}

	trash2 = new Component$5({ props: { size: 16 } });

	function click_handler_1() {
		return /*click_handler_1*/ ctx[35](/*index*/ ctx[83]);
	}

	return {
		c() {
			li = element("li");
			div = element("div");
			button0 = element("button");
			t0 = text(t0_value);
			t1 = space();
			span = element("span");
			t2 = text(t2_value);
			t3 = space();
			button1 = element("button");
			create_component(trash2.$$.fragment);
			t4 = space();
			this.h();
		},
		l(nodes) {
			li = claim_element(nodes, "LI", { class: true });
			var li_nodes = children(li);
			div = claim_element(li_nodes, "DIV", { class: true });
			var div_nodes = children(div);
			button0 = claim_element(div_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t0 = claim_text(button0_nodes, t0_value);
			button0_nodes.forEach(detach);
			t1 = claim_space(div_nodes);
			span = claim_element(div_nodes, "SPAN", { class: true });
			var span_nodes = children(span);
			t2 = claim_text(span_nodes, t2_value);
			span_nodes.forEach(detach);
			div_nodes.forEach(detach);
			t3 = claim_space(li_nodes);
			button1 = claim_element(li_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			claim_component(trash2.$$.fragment, button1_nodes);
			button1_nodes.forEach(detach);
			t4 = claim_space(li_nodes);
			li_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button0, "class", "playlist-item-title svelte-15i0b3z");
			attr(span, "class", "track-artist svelte-15i0b3z");
			attr(div, "class", "playlist-item-info svelte-15i0b3z");
			attr(button1, "class", "remove-from-playlist svelte-15i0b3z");
			attr(li, "class", "playlist-item svelte-15i0b3z");
			toggle_class(li, "active", /*currentVideoId*/ ctx[9] === /*track*/ ctx[81].videoId);
		},
		m(target, anchor) {
			insert_hydration(target, li, anchor);
			append_hydration(li, div);
			append_hydration(div, button0);
			append_hydration(button0, t0);
			append_hydration(div, t1);
			append_hydration(div, span);
			append_hydration(span, t2);
			append_hydration(li, t3);
			append_hydration(li, button1);
			mount_component(trash2, button1, null);
			append_hydration(li, t4);
			current = true;

			if (!mounted) {
				dispose = [
					listen(button0, "click", click_handler),
					listen(button1, "click", click_handler_1)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if ((!current || dirty[0] & /*playlist*/ 256) && t0_value !== (t0_value = /*track*/ ctx[81].title + "")) set_data(t0, t0_value);
			if ((!current || dirty[0] & /*playlist*/ 256) && t2_value !== (t2_value = /*track*/ ctx[81].artist + "")) set_data(t2, t2_value);

			if (!current || dirty[0] & /*currentVideoId, playlist*/ 768) {
				toggle_class(li, "active", /*currentVideoId*/ ctx[9] === /*track*/ ctx[81].videoId);
			}
		},
		i(local) {
			if (current) return;
			transition_in(trash2.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(trash2.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(li);
			destroy_component(trash2);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1527:2) {#if showSearchModal}
function create_if_block_1(ctx) {
	let div2;
	let div1;
	let button0;
	let x;
	let t0;
	let h2;
	let t1;
	let t2;
	let div0;
	let input;
	let t3;
	let button1;
	let t4;
	let t5;
	let current_block_type_index;
	let if_block;
	let current;
	let mounted;
	let dispose;
	x = new Component$1({});
	const if_block_creators = [create_if_block_2, create_if_block_3, create_if_block_5];
	const if_blocks = [];

	function select_block_type_2(ctx, dirty) {
		if (/*isSearching*/ ctx[10]) return 0;
		if (/*searchResults*/ ctx[6].length > 0) return 1;
		if (/*searchResults*/ ctx[6].length === 0 && !/*isSearching*/ ctx[10]) return 2;
		return -1;
	}

	if (~(current_block_type_index = select_block_type_2(ctx))) {
		if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
	}

	return {
		c() {
			div2 = element("div");
			div1 = element("div");
			button0 = element("button");
			create_component(x.$$.fragment);
			t0 = space();
			h2 = element("h2");
			t1 = text("Search YouTube");
			t2 = space();
			div0 = element("div");
			input = element("input");
			t3 = space();
			button1 = element("button");
			t4 = text("Search");
			t5 = space();
			if (if_block) if_block.c();
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			button0 = claim_element(div1_nodes, "BUTTON", { class: true, "aria-label": true });
			var button0_nodes = children(button0);
			claim_component(x.$$.fragment, button0_nodes);
			button0_nodes.forEach(detach);
			t0 = claim_space(div1_nodes);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t1 = claim_text(h2_nodes, "Search YouTube");
			h2_nodes.forEach(detach);
			t2 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			input = claim_element(div0_nodes, "INPUT", {
				type: true,
				placeholder: true,
				"aria-label": true,
				class: true
			});

			t3 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t4 = claim_text(button1_nodes, "Search");
			button1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			if (if_block) if_block.l(div1_nodes);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button0, "class", "modal-close svelte-15i0b3z");
			attr(button0, "aria-label", "Close search modal");
			attr(h2, "class", "svelte-15i0b3z");
			attr(input, "type", "text");
			attr(input, "placeholder", "Search for tracks...");
			attr(input, "aria-label", "Search for tracks");
			attr(input, "class", "svelte-15i0b3z");
			attr(button1, "class", "svelte-15i0b3z");
			attr(div0, "class", "search-input svelte-15i0b3z");
			attr(div1, "class", "modal-content svelte-15i0b3z");
			attr(div2, "class", "modal svelte-15i0b3z");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div1);
			append_hydration(div1, button0);
			mount_component(x, button0, null);
			append_hydration(div1, t0);
			append_hydration(div1, h2);
			append_hydration(h2, t1);
			append_hydration(div1, t2);
			append_hydration(div1, div0);
			append_hydration(div0, input);
			set_input_value(input, /*searchQuery*/ ctx[3]);
			append_hydration(div0, t3);
			append_hydration(div0, button1);
			append_hydration(button1, t4);
			append_hydration(div1, t5);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].m(div1, null);
			}

			current = true;

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_2*/ ctx[36]),
					listen(input, "input", /*input_input_handler*/ ctx[37]),
					listen(input, "keydown", /*keydown_handler*/ ctx[38]),
					listen(button1, "click", /*searchYouTube*/ ctx[15])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*searchQuery*/ 8 && input.value !== /*searchQuery*/ ctx[3]) {
				set_input_value(input, /*searchQuery*/ ctx[3]);
			}

			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type_2(ctx);

			if (current_block_type_index === previous_block_index) {
				if (~current_block_type_index) {
					if_blocks[current_block_type_index].p(ctx, dirty);
				}
			} else {
				if (if_block) {
					group_outros();

					transition_out(if_blocks[previous_block_index], 1, 1, () => {
						if_blocks[previous_block_index] = null;
					});

					check_outros();
				}

				if (~current_block_type_index) {
					if_block = if_blocks[current_block_type_index];

					if (!if_block) {
						if_block = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
						if_block.c();
					} else {
						if_block.p(ctx, dirty);
					}

					transition_in(if_block, 1);
					if_block.m(div1, null);
				} else {
					if_block = null;
				}
			}
		},
		i(local) {
			if (current) return;
			transition_in(x.$$.fragment, local);
			transition_in(if_block);
			current = true;
		},
		o(local) {
			transition_out(x.$$.fragment, local);
			transition_out(if_block);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div2);
			destroy_component(x);

			if (~current_block_type_index) {
				if_blocks[current_block_type_index].d();
			}

			mounted = false;
			run_all(dispose);
		}
	};
}

// (1580:61) 
function create_if_block_5(ctx) {
	let p;
	let t;

	return {
		c() {
			p = element("p");
			t = text("No results found");
		},
		l(nodes) {
			p = claim_element(nodes, "P", {});
			var p_nodes = children(p);
			t = claim_text(p_nodes, "No results found");
			p_nodes.forEach(detach);
		},
		m(target, anchor) {
			insert_hydration(target, p, anchor);
			append_hydration(p, t);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (1550:43) 
function create_if_block_3(ctx) {
	let div;
	let t;
	let if_block_anchor;
	let current;
	let each_value = /*searchResults*/ ctx[6].slice(0, /*displayedResults*/ ctx[7]);
	let each_blocks = [];

	for (let i = 0; i < each_value.length; i += 1) {
		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	let if_block = /*searchResults*/ ctx[6].length > /*displayedResults*/ ctx[7] && create_if_block_4(ctx);

	return {
		c() {
			div = element("div");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t = space();
			if (if_block) if_block.c();
			if_block_anchor = empty();
			this.h();
		},
		l(nodes) {
			div = claim_element(nodes, "DIV", { class: true });
			var div_nodes = children(div);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(div_nodes);
			}

			div_nodes.forEach(detach);
			t = claim_space(nodes);
			if (if_block) if_block.l(nodes);
			if_block_anchor = empty();
			this.h();
		},
		h() {
			attr(div, "class", "search-results svelte-15i0b3z");
		},
		m(target, anchor) {
			insert_hydration(target, div, anchor);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(div, null);
				}
			}

			insert_hydration(target, t, anchor);
			if (if_block) if_block.m(target, anchor);
			insert_hydration(target, if_block_anchor, anchor);
			current = true;
		},
		p(ctx, dirty) {
			if (dirty[0] & /*searchResults, displayedResults, addToPlaylist, playVideo*/ 655552) {
				each_value = /*searchResults*/ ctx[6].slice(0, /*displayedResults*/ ctx[7]);
				let i;

				for (i = 0; i < each_value.length; i += 1) {
					const child_ctx = get_each_context(ctx, each_value, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(div, null);
					}
				}

				group_outros();

				for (i = each_value.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}

			if (/*searchResults*/ ctx[6].length > /*displayedResults*/ ctx[7]) {
				if (if_block) {
					if_block.p(ctx, dirty);
				} else {
					if_block = create_if_block_4(ctx);
					if_block.c();
					if_block.m(if_block_anchor.parentNode, if_block_anchor);
				}
			} else if (if_block) {
				if_block.d(1);
				if_block = null;
			}
		},
		i(local) {
			if (current) return;

			for (let i = 0; i < each_value.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			current = true;
		},
		o(local) {
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			current = false;
		},
		d(detaching) {
			if (detaching) detach(div);
			destroy_each(each_blocks, detaching);
			if (detaching) detach(t);
			if (if_block) if_block.d(detaching);
			if (detaching) detach(if_block_anchor);
		}
	};
}

// (1548:8) {#if isSearching}
function create_if_block_2(ctx) {
	let p;
	let t;

	return {
		c() {
			p = element("p");
			t = text("Searching...");
		},
		l(nodes) {
			p = claim_element(nodes, "P", {});
			var p_nodes = children(p);
			t = claim_text(p_nodes, "Searching...");
			p_nodes.forEach(detach);
		},
		m(target, anchor) {
			insert_hydration(target, p, anchor);
			append_hydration(p, t);
		},
		p: noop,
		i: noop,
		o: noop,
		d(detaching) {
			if (detaching) detach(p);
		}
	};
}

// (1552:12) {#each searchResults.slice(0, displayedResults) as result}
function create_each_block(ctx) {
	let div1;
	let span0;
	let t0_value = /*result*/ ctx[78].title + "";
	let t0;
	let t1;
	let span1;
	let t2_value = /*result*/ ctx[78].artist + "";
	let t2;
	let t3;
	let div0;
	let button0;
	let play;
	let button0_aria_label_value;
	let t4;
	let button1;
	let list;
	let button1_aria_label_value;
	let t5;
	let current;
	let mounted;
	let dispose;
	play = new Component$a({ props: { size: 15 } });

	function click_handler_3() {
		return /*click_handler_3*/ ctx[39](/*result*/ ctx[78]);
	}

	list = new Component$c({ props: { size: 15 } });

	function click_handler_4() {
		return /*click_handler_4*/ ctx[40](/*result*/ ctx[78]);
	}

	return {
		c() {
			div1 = element("div");
			span0 = element("span");
			t0 = text(t0_value);
			t1 = space();
			span1 = element("span");
			t2 = text(t2_value);
			t3 = space();
			div0 = element("div");
			button0 = element("button");
			create_component(play.$$.fragment);
			t4 = space();
			button1 = element("button");
			create_component(list.$$.fragment);
			t5 = space();
			this.h();
		},
		l(nodes) {
			div1 = claim_element(nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			span0 = claim_element(div1_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, t0_value);
			span0_nodes.forEach(detach);
			t1 = claim_space(div1_nodes);
			span1 = claim_element(div1_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t2 = claim_text(span1_nodes, t2_value);
			span1_nodes.forEach(detach);
			t3 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			button0 = claim_element(div0_nodes, "BUTTON", { class: true, "aria-label": true });
			var button0_nodes = children(button0);
			claim_component(play.$$.fragment, button0_nodes);
			button0_nodes.forEach(detach);
			t4 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true, "aria-label": true });
			var button1_nodes = children(button1);
			claim_component(list.$$.fragment, button1_nodes);
			button1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t5 = claim_space(div1_nodes);
			div1_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "svelte-15i0b3z");
			attr(span1, "class", "artist svelte-15i0b3z");
			attr(button0, "class", "action-btn svelte-15i0b3z");
			attr(button0, "aria-label", button0_aria_label_value = `Play ${/*result*/ ctx[78].title} by ${/*result*/ ctx[78].artist}`);
			attr(button1, "class", "action-btn svelte-15i0b3z");
			attr(button1, "aria-label", button1_aria_label_value = `Add ${/*result*/ ctx[78].title} to playlist`);
			attr(div0, "class", "search-result-actions svelte-15i0b3z");
			attr(div1, "class", "search-result-item svelte-15i0b3z");
		},
		m(target, anchor) {
			insert_hydration(target, div1, anchor);
			append_hydration(div1, span0);
			append_hydration(span0, t0);
			append_hydration(div1, t1);
			append_hydration(div1, span1);
			append_hydration(span1, t2);
			append_hydration(div1, t3);
			append_hydration(div1, div0);
			append_hydration(div0, button0);
			mount_component(play, button0, null);
			append_hydration(div0, t4);
			append_hydration(div0, button1);
			mount_component(list, button1, null);
			append_hydration(div1, t5);
			current = true;

			if (!mounted) {
				dispose = [
					listen(button0, "click", click_handler_3),
					listen(button1, "click", click_handler_4)
				];

				mounted = true;
			}
		},
		p(new_ctx, dirty) {
			ctx = new_ctx;
			if ((!current || dirty[0] & /*searchResults, displayedResults*/ 192) && t0_value !== (t0_value = /*result*/ ctx[78].title + "")) set_data(t0, t0_value);
			if ((!current || dirty[0] & /*searchResults, displayedResults*/ 192) && t2_value !== (t2_value = /*result*/ ctx[78].artist + "")) set_data(t2, t2_value);

			if (!current || dirty[0] & /*searchResults, displayedResults*/ 192 && button0_aria_label_value !== (button0_aria_label_value = `Play ${/*result*/ ctx[78].title} by ${/*result*/ ctx[78].artist}`)) {
				attr(button0, "aria-label", button0_aria_label_value);
			}

			if (!current || dirty[0] & /*searchResults, displayedResults*/ 192 && button1_aria_label_value !== (button1_aria_label_value = `Add ${/*result*/ ctx[78].title} to playlist`)) {
				attr(button1, "aria-label", button1_aria_label_value);
			}
		},
		i(local) {
			if (current) return;
			transition_in(play.$$.fragment, local);
			transition_in(list.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(play.$$.fragment, local);
			transition_out(list.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div1);
			destroy_component(play);
			destroy_component(list);
			mounted = false;
			run_all(dispose);
		}
	};
}

// (1575:10) {#if searchResults.length > displayedResults}
function create_if_block_4(ctx) {
	let button;
	let t;
	let mounted;
	let dispose;

	return {
		c() {
			button = element("button");
			t = text("Load More");
			this.h();
		},
		l(nodes) {
			button = claim_element(nodes, "BUTTON", { class: true, "aria-label": true });
			var button_nodes = children(button);
			t = claim_text(button_nodes, "Load More");
			button_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button, "class", "load-more svelte-15i0b3z");
			attr(button, "aria-label", "Load more results");
		},
		m(target, anchor) {
			insert_hydration(target, button, anchor);
			append_hydration(button, t);

			if (!mounted) {
				dispose = listen(button, "click", /*loadMore*/ ctx[16]);
				mounted = true;
			}
		},
		p: noop,
		d(detaching) {
			if (detaching) detach(button);
			mounted = false;
			dispose();
		}
	};
}

// (1587:2) {#if showApiKeyModal}
function create_if_block(ctx) {
	let div2;
	let div1;
	let button0;
	let x;
	let t0;
	let h2;
	let t1;
	let t2;
	let div0;
	let input;
	let t3;
	let button1;
	let t4;
	let current;
	let mounted;
	let dispose;
	x = new Component$1({});

	return {
		c() {
			div2 = element("div");
			div1 = element("div");
			button0 = element("button");
			create_component(x.$$.fragment);
			t0 = space();
			h2 = element("h2");
			t1 = text("YouTube API Key");
			t2 = space();
			div0 = element("div");
			input = element("input");
			t3 = space();
			button1 = element("button");
			t4 = text("Save");
			this.h();
		},
		l(nodes) {
			div2 = claim_element(nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			button0 = claim_element(div1_nodes, "BUTTON", { class: true, "aria-label": true });
			var button0_nodes = children(button0);
			claim_component(x.$$.fragment, button0_nodes);
			button0_nodes.forEach(detach);
			t0 = claim_space(div1_nodes);
			h2 = claim_element(div1_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t1 = claim_text(h2_nodes, "YouTube API Key");
			h2_nodes.forEach(detach);
			t2 = claim_space(div1_nodes);
			div0 = claim_element(div1_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);

			input = claim_element(div0_nodes, "INPUT", {
				type: true,
				placeholder: true,
				"aria-label": true,
				class: true
			});

			t3 = claim_space(div0_nodes);
			button1 = claim_element(div0_nodes, "BUTTON", { class: true });
			var button1_nodes = children(button1);
			t4 = claim_text(button1_nodes, "Save");
			button1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			div1_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(button0, "class", "modal-close svelte-15i0b3z");
			attr(button0, "aria-label", "Close API key modal");
			attr(h2, "class", "svelte-15i0b3z");
			attr(input, "type", "text");
			attr(input, "placeholder", "Enter your API key");
			attr(input, "aria-label", "YouTube API Key");
			attr(input, "class", "svelte-15i0b3z");
			attr(button1, "class", "svelte-15i0b3z");
			attr(div0, "class", "api-key-input svelte-15i0b3z");
			attr(div1, "class", "modal-content svelte-15i0b3z");
			attr(div2, "class", "modal svelte-15i0b3z");
		},
		m(target, anchor) {
			insert_hydration(target, div2, anchor);
			append_hydration(div2, div1);
			append_hydration(div1, button0);
			mount_component(x, button0, null);
			append_hydration(div1, t0);
			append_hydration(div1, h2);
			append_hydration(h2, t1);
			append_hydration(div1, t2);
			append_hydration(div1, div0);
			append_hydration(div0, input);
			set_input_value(input, /*youtubeApiKey*/ ctx[11]);
			append_hydration(div0, t3);
			append_hydration(div0, button1);
			append_hydration(button1, t4);
			current = true;

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*click_handler_5*/ ctx[41]),
					listen(input, "input", /*input_input_handler_1*/ ctx[42]),
					listen(button1, "click", /*setApiKey*/ ctx[24])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (dirty[0] & /*youtubeApiKey*/ 2048 && input.value !== /*youtubeApiKey*/ ctx[11]) {
				set_input_value(input, /*youtubeApiKey*/ ctx[11]);
			}
		},
		i(local) {
			if (current) return;
			transition_in(x.$$.fragment, local);
			current = true;
		},
		o(local) {
			transition_out(x.$$.fragment, local);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div2);
			destroy_component(x);
			mounted = false;
			run_all(dispose);
		}
	};
}

function create_fragment(ctx) {
	let div20;
	let header;
	let div2;
	let div0;
	let span0;
	let t0;
	let t1;
	let h1;
	let t2;
	let t3;
	let div1;
	let search;
	let t4;
	let input0;
	let t5;
	let button0;
	let t6;
	let t7;
	let div18;
	let div15;
	let div3;
	let img;
	let img_src_value;
	let t8;
	let div6;
	let div4;

	let t9_value = (/*currentTrackInfo*/ ctx[13]
	? /*currentTrackInfo*/ ctx[13].title
	: 'Midnight Serenade') + "";

	let t9;
	let t10;
	let div5;
	let span1;

	let t11_value = (/*currentTrackInfo*/ ctx[13]
	? /*currentTrackInfo*/ ctx[13].artist
	: 'Luna Beats') + "";

	let t11;
	let t12;
	let div7;
	let button1;
	let skipback;
	let t13;
	let button2;
	let current_block_type_index;
	let if_block0;
	let button2_aria_label_value;
	let t14;
	let button3;
	let skipforward;
	let t15;
	let div12;
	let div9;
	let div8;
	let div9_aria_valuenow_value;
	let t16;
	let div10;
	let span2;
	let t17_value = formatTime(/*currentTime*/ ctx[0]) + "";
	let t17;
	let t18;
	let span3;
	let t19_value = formatTime(/*duration*/ ctx[1]) + "";
	let t19;
	let t20;
	let div11;
	let t21;
	let t22;
	let t23;
	let div13;
	let button4;
	let current_block_type_index_1;
	let if_block1;
	let t24;
	let input1;
	let t25;
	let div14;
	let button5;
	let t26;
	let t27;
	let button6;
	let t28;
	let t29;
	let div17;
	let h2;
	let t30;
	let t31;
	let div16;
	let ul;
	let t32;
	let button7;
	let plus;
	let t33;
	let t34;
	let t35;
	let div19;
	let current;
	let mounted;
	let dispose;

	search = new Component$8({
			props: { size: 20, class: "search-icon" }
		});

	skipback = new Component$7({ props: { size: 24 } });
	const if_block_creators = [create_if_block_8, create_else_block_1];
	const if_blocks = [];

	function select_block_type(ctx, dirty) {
		if (/*isPlaying*/ ctx[2]) return 0;
		return 1;
	}

	current_block_type_index = select_block_type(ctx);
	if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
	skipforward = new Component$6({ props: { size: 24 } });
	const if_block_creators_1 = [create_if_block_6, create_if_block_7, create_else_block];
	const if_blocks_1 = [];

	function select_block_type_1(ctx, dirty) {
		if (/*volume*/ ctx[12] === 0) return 0;
		if (/*volume*/ ctx[12] < 50) return 1;
		return 2;
	}

	current_block_type_index_1 = select_block_type_1(ctx);
	if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
	let each_value_1 = /*playlist*/ ctx[8];
	let each_blocks = [];

	for (let i = 0; i < each_value_1.length; i += 1) {
		each_blocks[i] = create_each_block_1(get_each_context_1(ctx, each_value_1, i));
	}

	const out = i => transition_out(each_blocks[i], 1, 1, () => {
		each_blocks[i] = null;
	});

	plus = new Component$9({ props: { size: 16 } });
	let if_block2 = /*showSearchModal*/ ctx[4] && create_if_block_1(ctx);
	let if_block3 = /*showApiKeyModal*/ ctx[5] && create_if_block(ctx);

	return {
		c() {
			div20 = element("div");
			header = element("header");
			div2 = element("div");
			div0 = element("div");
			span0 = element("span");
			t0 = text("♫");
			t1 = space();
			h1 = element("h1");
			t2 = text("Harmony");
			t3 = space();
			div1 = element("div");
			create_component(search.$$.fragment);
			t4 = space();
			input0 = element("input");
			t5 = space();
			button0 = element("button");
			t6 = text("Add Your API Key");
			t7 = space();
			div18 = element("div");
			div15 = element("div");
			div3 = element("div");
			img = element("img");
			t8 = space();
			div6 = element("div");
			div4 = element("div");
			t9 = text(t9_value);
			t10 = space();
			div5 = element("div");
			span1 = element("span");
			t11 = text(t11_value);
			t12 = space();
			div7 = element("div");
			button1 = element("button");
			create_component(skipback.$$.fragment);
			t13 = space();
			button2 = element("button");
			if_block0.c();
			t14 = space();
			button3 = element("button");
			create_component(skipforward.$$.fragment);
			t15 = space();
			div12 = element("div");
			div9 = element("div");
			div8 = element("div");
			t16 = space();
			div10 = element("div");
			span2 = element("span");
			t17 = text(t17_value);
			t18 = space();
			span3 = element("span");
			t19 = text(t19_value);
			t20 = space();
			div11 = element("div");
			t21 = text(/*volume*/ ctx[12]);
			t22 = text("%");
			t23 = space();
			div13 = element("div");
			button4 = element("button");
			if_block1.c();
			t24 = space();
			input1 = element("input");
			t25 = space();
			div14 = element("div");
			button5 = element("button");
			t26 = text("Search Lyrics");
			t27 = space();
			button6 = element("button");
			t28 = text("Save Playlist");
			t29 = space();
			div17 = element("div");
			h2 = element("h2");
			t30 = text("Playlist");
			t31 = space();
			div16 = element("div");
			ul = element("ul");

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].c();
			}

			t32 = space();
			button7 = element("button");
			create_component(plus.$$.fragment);
			t33 = space();
			if (if_block2) if_block2.c();
			t34 = space();
			if (if_block3) if_block3.c();
			t35 = space();
			div19 = element("div");
			this.h();
		},
		l(nodes) {
			div20 = claim_element(nodes, "DIV", { class: true });
			var div20_nodes = children(div20);
			header = claim_element(div20_nodes, "HEADER", { class: true });
			var header_nodes = children(header);
			div2 = claim_element(header_nodes, "DIV", { class: true });
			var div2_nodes = children(div2);
			div0 = claim_element(div2_nodes, "DIV", { class: true });
			var div0_nodes = children(div0);
			span0 = claim_element(div0_nodes, "SPAN", { class: true });
			var span0_nodes = children(span0);
			t0 = claim_text(span0_nodes, "♫");
			span0_nodes.forEach(detach);
			t1 = claim_space(div0_nodes);
			h1 = claim_element(div0_nodes, "H1", { class: true });
			var h1_nodes = children(h1);
			t2 = claim_text(h1_nodes, "Harmony");
			h1_nodes.forEach(detach);
			div0_nodes.forEach(detach);
			t3 = claim_space(div2_nodes);
			div1 = claim_element(div2_nodes, "DIV", { class: true });
			var div1_nodes = children(div1);
			claim_component(search.$$.fragment, div1_nodes);
			t4 = claim_space(div1_nodes);

			input0 = claim_element(div1_nodes, "INPUT", {
				type: true,
				placeholder: true,
				class: true
			});

			div1_nodes.forEach(detach);
			t5 = claim_space(div2_nodes);
			button0 = claim_element(div2_nodes, "BUTTON", { class: true });
			var button0_nodes = children(button0);
			t6 = claim_text(button0_nodes, "Add Your API Key");
			button0_nodes.forEach(detach);
			div2_nodes.forEach(detach);
			header_nodes.forEach(detach);
			t7 = claim_space(div20_nodes);
			div18 = claim_element(div20_nodes, "DIV", { class: true });
			var div18_nodes = children(div18);
			div15 = claim_element(div18_nodes, "DIV", { class: true });
			var div15_nodes = children(div15);
			div3 = claim_element(div15_nodes, "DIV", { class: true });
			var div3_nodes = children(div3);
			img = claim_element(div3_nodes, "IMG", { src: true, alt: true, class: true });
			div3_nodes.forEach(detach);
			t8 = claim_space(div15_nodes);
			div6 = claim_element(div15_nodes, "DIV", { class: true });
			var div6_nodes = children(div6);
			div4 = claim_element(div6_nodes, "DIV", { class: true });
			var div4_nodes = children(div4);
			t9 = claim_text(div4_nodes, t9_value);
			div4_nodes.forEach(detach);
			t10 = claim_space(div6_nodes);
			div5 = claim_element(div6_nodes, "DIV", { class: true });
			var div5_nodes = children(div5);
			span1 = claim_element(div5_nodes, "SPAN", { class: true });
			var span1_nodes = children(span1);
			t11 = claim_text(span1_nodes, t11_value);
			span1_nodes.forEach(detach);
			div5_nodes.forEach(detach);
			div6_nodes.forEach(detach);
			t12 = claim_space(div15_nodes);
			div7 = claim_element(div15_nodes, "DIV", { class: true });
			var div7_nodes = children(div7);
			button1 = claim_element(div7_nodes, "BUTTON", { class: true, "aria-label": true });
			var button1_nodes = children(button1);
			claim_component(skipback.$$.fragment, button1_nodes);
			button1_nodes.forEach(detach);
			t13 = claim_space(div7_nodes);
			button2 = claim_element(div7_nodes, "BUTTON", { class: true, "aria-label": true });
			var button2_nodes = children(button2);
			if_block0.l(button2_nodes);
			button2_nodes.forEach(detach);
			t14 = claim_space(div7_nodes);
			button3 = claim_element(div7_nodes, "BUTTON", { class: true, "aria-label": true });
			var button3_nodes = children(button3);
			claim_component(skipforward.$$.fragment, button3_nodes);
			button3_nodes.forEach(detach);
			div7_nodes.forEach(detach);
			t15 = claim_space(div15_nodes);
			div12 = claim_element(div15_nodes, "DIV", { class: true });
			var div12_nodes = children(div12);

			div9 = claim_element(div12_nodes, "DIV", {
				class: true,
				tabindex: true,
				role: true,
				"aria-label": true,
				"aria-valuemin": true,
				"aria-valuemax": true,
				"aria-valuenow": true
			});

			var div9_nodes = children(div9);
			div8 = claim_element(div9_nodes, "DIV", { class: true, style: true });
			children(div8).forEach(detach);
			div9_nodes.forEach(detach);
			t16 = claim_space(div12_nodes);
			div10 = claim_element(div12_nodes, "DIV", { class: true });
			var div10_nodes = children(div10);
			span2 = claim_element(div10_nodes, "SPAN", {});
			var span2_nodes = children(span2);
			t17 = claim_text(span2_nodes, t17_value);
			span2_nodes.forEach(detach);
			t18 = claim_space(div10_nodes);
			span3 = claim_element(div10_nodes, "SPAN", {});
			var span3_nodes = children(span3);
			t19 = claim_text(span3_nodes, t19_value);
			span3_nodes.forEach(detach);
			div10_nodes.forEach(detach);
			t20 = claim_space(div12_nodes);
			div11 = claim_element(div12_nodes, "DIV", { class: true });
			var div11_nodes = children(div11);
			t21 = claim_text(div11_nodes, /*volume*/ ctx[12]);
			t22 = claim_text(div11_nodes, "%");
			div11_nodes.forEach(detach);
			div12_nodes.forEach(detach);
			t23 = claim_space(div15_nodes);
			div13 = claim_element(div15_nodes, "DIV", { class: true });
			var div13_nodes = children(div13);
			button4 = claim_element(div13_nodes, "BUTTON", { class: true, "aria-label": true });
			var button4_nodes = children(button4);
			if_block1.l(button4_nodes);
			button4_nodes.forEach(detach);
			t24 = claim_space(div13_nodes);

			input1 = claim_element(div13_nodes, "INPUT", {
				type: true,
				min: true,
				max: true,
				class: true,
				"aria-label": true
			});

			div13_nodes.forEach(detach);
			t25 = claim_space(div15_nodes);
			div14 = claim_element(div15_nodes, "DIV", { class: true });
			var div14_nodes = children(div14);
			button5 = claim_element(div14_nodes, "BUTTON", { class: true });
			var button5_nodes = children(button5);
			t26 = claim_text(button5_nodes, "Search Lyrics");
			button5_nodes.forEach(detach);
			t27 = claim_space(div14_nodes);
			button6 = claim_element(div14_nodes, "BUTTON", { class: true });
			var button6_nodes = children(button6);
			t28 = claim_text(button6_nodes, "Save Playlist");
			button6_nodes.forEach(detach);
			div14_nodes.forEach(detach);
			div15_nodes.forEach(detach);
			t29 = claim_space(div18_nodes);
			div17 = claim_element(div18_nodes, "DIV", { class: true });
			var div17_nodes = children(div17);
			h2 = claim_element(div17_nodes, "H2", { class: true });
			var h2_nodes = children(h2);
			t30 = claim_text(h2_nodes, "Playlist");
			h2_nodes.forEach(detach);
			t31 = claim_space(div17_nodes);
			div16 = claim_element(div17_nodes, "DIV", { class: true });
			var div16_nodes = children(div16);
			ul = claim_element(div16_nodes, "UL", { class: true });
			var ul_nodes = children(ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				each_blocks[i].l(ul_nodes);
			}

			ul_nodes.forEach(detach);
			div16_nodes.forEach(detach);
			t32 = claim_space(div17_nodes);
			button7 = claim_element(div17_nodes, "BUTTON", { class: true });
			var button7_nodes = children(button7);
			claim_component(plus.$$.fragment, button7_nodes);
			button7_nodes.forEach(detach);
			div17_nodes.forEach(detach);
			div18_nodes.forEach(detach);
			t33 = claim_space(div20_nodes);
			if (if_block2) if_block2.l(div20_nodes);
			t34 = claim_space(div20_nodes);
			if (if_block3) if_block3.l(div20_nodes);
			t35 = claim_space(div20_nodes);
			div19 = claim_element(div20_nodes, "DIV", { id: true, class: true });
			children(div19).forEach(detach);
			div20_nodes.forEach(detach);
			this.h();
		},
		h() {
			attr(span0, "class", "logo svelte-15i0b3z");
			attr(h1, "class", "svelte-15i0b3z");
			attr(div0, "class", "logo-title svelte-15i0b3z");
			attr(input0, "type", "text");
			attr(input0, "placeholder", "Search");
			attr(input0, "class", "svelte-15i0b3z");
			attr(div1, "class", "search-input svelte-15i0b3z");
			attr(button0, "class", "add-api-key-btn svelte-15i0b3z");
			attr(div2, "class", "header-content svelte-15i0b3z");
			attr(header, "class", "header-section svelte-15i0b3z");
			if (!src_url_equal(img.src, img_src_value = /*thumbnailUrl*/ ctx[14] || "/placeholder.svg")) attr(img, "src", img_src_value);
			attr(img, "alt", "Album Art");
			attr(img, "class", "svelte-15i0b3z");
			attr(div3, "class", "album-art svelte-15i0b3z");
			attr(div4, "class", "title svelte-15i0b3z");
			attr(span1, "class", "artist");
			attr(div5, "class", "artist-album svelte-15i0b3z");
			attr(div6, "class", "track-info svelte-15i0b3z");
			attr(button1, "class", "control-btn svelte-15i0b3z");
			attr(button1, "aria-label", "Previous");
			attr(button2, "class", "control-btn play-btn svelte-15i0b3z");
			attr(button2, "aria-label", button2_aria_label_value = /*isPlaying*/ ctx[2] ? 'Pause' : 'Play');
			attr(button3, "class", "control-btn svelte-15i0b3z");
			attr(button3, "aria-label", "Next");
			attr(div7, "class", "controls svelte-15i0b3z");
			attr(div8, "class", "progress-bar svelte-15i0b3z");
			set_style(div8, "width", /*currentTime*/ ctx[0] / /*duration*/ ctx[1] * 100 + "%");
			attr(div9, "class", "progress-container svelte-15i0b3z");
			attr(div9, "tabindex", "0");
			attr(div9, "role", "slider");
			attr(div9, "aria-label", "Seek position in track");
			attr(div9, "aria-valuemin", "0");
			attr(div9, "aria-valuemax", "100");
			attr(div9, "aria-valuenow", div9_aria_valuenow_value = Math.round(/*currentTime*/ ctx[0] / /*duration*/ ctx[1] * 100));
			attr(div10, "class", "time-display svelte-15i0b3z");
			attr(div11, "class", "volume-indicator svelte-15i0b3z");
			attr(div12, "class", "time-progress svelte-15i0b3z");
			attr(button4, "class", "volume-button svelte-15i0b3z");
			attr(button4, "aria-label", "Toggle mute");
			attr(input1, "type", "range");
			attr(input1, "min", "0");
			attr(input1, "max", "100");
			attr(input1, "class", "volume-slider svelte-15i0b3z");
			attr(input1, "aria-label", "Volume control");
			attr(div13, "class", "volume-control svelte-15i0b3z");
			attr(button5, "class", "action-btn search-lyrics-btn svelte-15i0b3z");
			attr(button6, "class", "action-btn save-playlist-btn svelte-15i0b3z");
			attr(div14, "class", "action-buttons svelte-15i0b3z");
			attr(div15, "class", "player-section svelte-15i0b3z");
			attr(h2, "class", "svelte-15i0b3z");
			attr(ul, "class", "playlist-list svelte-15i0b3z");
			attr(div16, "class", "playlist-card svelte-15i0b3z");
			attr(button7, "class", "add-to-playlist svelte-15i0b3z");
			attr(div17, "class", "playlist-section svelte-15i0b3z");
			attr(div18, "class", "player-layout svelte-15i0b3z");
			attr(div19, "id", "youtube-player");
			attr(div19, "class", "svelte-15i0b3z");
			attr(div20, "class", "player-container svelte-15i0b3z");
		},
		m(target, anchor) {
			insert_hydration(target, div20, anchor);
			append_hydration(div20, header);
			append_hydration(header, div2);
			append_hydration(div2, div0);
			append_hydration(div0, span0);
			append_hydration(span0, t0);
			append_hydration(div0, t1);
			append_hydration(div0, h1);
			append_hydration(h1, t2);
			append_hydration(div2, t3);
			append_hydration(div2, div1);
			mount_component(search, div1, null);
			append_hydration(div1, t4);
			append_hydration(div1, input0);
			append_hydration(div2, t5);
			append_hydration(div2, button0);
			append_hydration(button0, t6);
			append_hydration(div20, t7);
			append_hydration(div20, div18);
			append_hydration(div18, div15);
			append_hydration(div15, div3);
			append_hydration(div3, img);
			append_hydration(div15, t8);
			append_hydration(div15, div6);
			append_hydration(div6, div4);
			append_hydration(div4, t9);
			append_hydration(div6, t10);
			append_hydration(div6, div5);
			append_hydration(div5, span1);
			append_hydration(span1, t11);
			append_hydration(div15, t12);
			append_hydration(div15, div7);
			append_hydration(div7, button1);
			mount_component(skipback, button1, null);
			append_hydration(div7, t13);
			append_hydration(div7, button2);
			if_blocks[current_block_type_index].m(button2, null);
			append_hydration(div7, t14);
			append_hydration(div7, button3);
			mount_component(skipforward, button3, null);
			append_hydration(div15, t15);
			append_hydration(div15, div12);
			append_hydration(div12, div9);
			append_hydration(div9, div8);
			append_hydration(div12, t16);
			append_hydration(div12, div10);
			append_hydration(div10, span2);
			append_hydration(span2, t17);
			append_hydration(div10, t18);
			append_hydration(div10, span3);
			append_hydration(span3, t19);
			append_hydration(div12, t20);
			append_hydration(div12, div11);
			append_hydration(div11, t21);
			append_hydration(div11, t22);
			append_hydration(div15, t23);
			append_hydration(div15, div13);
			append_hydration(div13, button4);
			if_blocks_1[current_block_type_index_1].m(button4, null);
			append_hydration(div13, t24);
			append_hydration(div13, input1);
			set_input_value(input1, /*volume*/ ctx[12]);
			append_hydration(div15, t25);
			append_hydration(div15, div14);
			append_hydration(div14, button5);
			append_hydration(button5, t26);
			append_hydration(div14, t27);
			append_hydration(div14, button6);
			append_hydration(button6, t28);
			append_hydration(div18, t29);
			append_hydration(div18, div17);
			append_hydration(div17, h2);
			append_hydration(h2, t30);
			append_hydration(div17, t31);
			append_hydration(div17, div16);
			append_hydration(div16, ul);

			for (let i = 0; i < each_blocks.length; i += 1) {
				if (each_blocks[i]) {
					each_blocks[i].m(ul, null);
				}
			}

			append_hydration(div17, t32);
			append_hydration(div17, button7);
			mount_component(plus, button7, null);
			append_hydration(div20, t33);
			if (if_block2) if_block2.m(div20, null);
			append_hydration(div20, t34);
			if (if_block3) if_block3.m(div20, null);
			append_hydration(div20, t35);
			append_hydration(div20, div19);
			current = true;

			if (!mounted) {
				dispose = [
					listen(button0, "click", /*handleApiKeyModalClick*/ ctx[26]),
					listen(button1, "click", /*playPreviousTrack*/ ctx[23]),
					listen(button2, "click", /*togglePlay*/ ctx[20]),
					listen(button3, "click", /*playNextTrack*/ ctx[22]),
					listen(div9, "click", /*handleProgressBarClick*/ ctx[29]),
					listen(div9, "keydown", /*handleProgressKeydown*/ ctx[28]),
					listen(button4, "click", /*toggleMute*/ ctx[30]),
					listen(input1, "change", /*input1_change_input_handler*/ ctx[32]),
					listen(input1, "input", /*input1_change_input_handler*/ ctx[32]),
					listen(input1, "input", /*input_handler*/ ctx[33]),
					listen(button5, "click", /*toggleLyrics*/ ctx[27]),
					listen(button7, "click", /*handleSearchYouTubeClick*/ ctx[25])
				];

				mounted = true;
			}
		},
		p(ctx, dirty) {
			if (!current || dirty[0] & /*thumbnailUrl*/ 16384 && !src_url_equal(img.src, img_src_value = /*thumbnailUrl*/ ctx[14] || "/placeholder.svg")) {
				attr(img, "src", img_src_value);
			}

			if ((!current || dirty[0] & /*currentTrackInfo*/ 8192) && t9_value !== (t9_value = (/*currentTrackInfo*/ ctx[13]
			? /*currentTrackInfo*/ ctx[13].title
			: 'Midnight Serenade') + "")) set_data(t9, t9_value);

			if ((!current || dirty[0] & /*currentTrackInfo*/ 8192) && t11_value !== (t11_value = (/*currentTrackInfo*/ ctx[13]
			? /*currentTrackInfo*/ ctx[13].artist
			: 'Luna Beats') + "")) set_data(t11, t11_value);

			let previous_block_index = current_block_type_index;
			current_block_type_index = select_block_type(ctx);

			if (current_block_type_index !== previous_block_index) {
				group_outros();

				transition_out(if_blocks[previous_block_index], 1, 1, () => {
					if_blocks[previous_block_index] = null;
				});

				check_outros();
				if_block0 = if_blocks[current_block_type_index];

				if (!if_block0) {
					if_block0 = if_blocks[current_block_type_index] = if_block_creators[current_block_type_index](ctx);
					if_block0.c();
				}

				transition_in(if_block0, 1);
				if_block0.m(button2, null);
			}

			if (!current || dirty[0] & /*isPlaying*/ 4 && button2_aria_label_value !== (button2_aria_label_value = /*isPlaying*/ ctx[2] ? 'Pause' : 'Play')) {
				attr(button2, "aria-label", button2_aria_label_value);
			}

			if (!current || dirty[0] & /*currentTime, duration*/ 3) {
				set_style(div8, "width", /*currentTime*/ ctx[0] / /*duration*/ ctx[1] * 100 + "%");
			}

			if (!current || dirty[0] & /*currentTime, duration*/ 3 && div9_aria_valuenow_value !== (div9_aria_valuenow_value = Math.round(/*currentTime*/ ctx[0] / /*duration*/ ctx[1] * 100))) {
				attr(div9, "aria-valuenow", div9_aria_valuenow_value);
			}

			if ((!current || dirty[0] & /*currentTime*/ 1) && t17_value !== (t17_value = formatTime(/*currentTime*/ ctx[0]) + "")) set_data(t17, t17_value);
			if ((!current || dirty[0] & /*duration*/ 2) && t19_value !== (t19_value = formatTime(/*duration*/ ctx[1]) + "")) set_data(t19, t19_value);
			if (!current || dirty[0] & /*volume*/ 4096) set_data(t21, /*volume*/ ctx[12]);
			let previous_block_index_1 = current_block_type_index_1;
			current_block_type_index_1 = select_block_type_1(ctx);

			if (current_block_type_index_1 !== previous_block_index_1) {
				group_outros();

				transition_out(if_blocks_1[previous_block_index_1], 1, 1, () => {
					if_blocks_1[previous_block_index_1] = null;
				});

				check_outros();
				if_block1 = if_blocks_1[current_block_type_index_1];

				if (!if_block1) {
					if_block1 = if_blocks_1[current_block_type_index_1] = if_block_creators_1[current_block_type_index_1](ctx);
					if_block1.c();
				}

				transition_in(if_block1, 1);
				if_block1.m(button4, null);
			}

			if (dirty[0] & /*volume*/ 4096) {
				set_input_value(input1, /*volume*/ ctx[12]);
			}

			if (dirty[0] & /*currentVideoId, playlist, removeFromPlaylist, playVideo*/ 787200) {
				each_value_1 = /*playlist*/ ctx[8];
				let i;

				for (i = 0; i < each_value_1.length; i += 1) {
					const child_ctx = get_each_context_1(ctx, each_value_1, i);

					if (each_blocks[i]) {
						each_blocks[i].p(child_ctx, dirty);
						transition_in(each_blocks[i], 1);
					} else {
						each_blocks[i] = create_each_block_1(child_ctx);
						each_blocks[i].c();
						transition_in(each_blocks[i], 1);
						each_blocks[i].m(ul, null);
					}
				}

				group_outros();

				for (i = each_value_1.length; i < each_blocks.length; i += 1) {
					out(i);
				}

				check_outros();
			}

			if (/*showSearchModal*/ ctx[4]) {
				if (if_block2) {
					if_block2.p(ctx, dirty);

					if (dirty[0] & /*showSearchModal*/ 16) {
						transition_in(if_block2, 1);
					}
				} else {
					if_block2 = create_if_block_1(ctx);
					if_block2.c();
					transition_in(if_block2, 1);
					if_block2.m(div20, t34);
				}
			} else if (if_block2) {
				group_outros();

				transition_out(if_block2, 1, 1, () => {
					if_block2 = null;
				});

				check_outros();
			}

			if (/*showApiKeyModal*/ ctx[5]) {
				if (if_block3) {
					if_block3.p(ctx, dirty);

					if (dirty[0] & /*showApiKeyModal*/ 32) {
						transition_in(if_block3, 1);
					}
				} else {
					if_block3 = create_if_block(ctx);
					if_block3.c();
					transition_in(if_block3, 1);
					if_block3.m(div20, t35);
				}
			} else if (if_block3) {
				group_outros();

				transition_out(if_block3, 1, 1, () => {
					if_block3 = null;
				});

				check_outros();
			}
		},
		i(local) {
			if (current) return;
			transition_in(search.$$.fragment, local);
			transition_in(skipback.$$.fragment, local);
			transition_in(if_block0);
			transition_in(skipforward.$$.fragment, local);
			transition_in(if_block1);

			for (let i = 0; i < each_value_1.length; i += 1) {
				transition_in(each_blocks[i]);
			}

			transition_in(plus.$$.fragment, local);
			transition_in(if_block2);
			transition_in(if_block3);
			current = true;
		},
		o(local) {
			transition_out(search.$$.fragment, local);
			transition_out(skipback.$$.fragment, local);
			transition_out(if_block0);
			transition_out(skipforward.$$.fragment, local);
			transition_out(if_block1);
			each_blocks = each_blocks.filter(Boolean);

			for (let i = 0; i < each_blocks.length; i += 1) {
				transition_out(each_blocks[i]);
			}

			transition_out(plus.$$.fragment, local);
			transition_out(if_block2);
			transition_out(if_block3);
			current = false;
		},
		d(detaching) {
			if (detaching) detach(div20);
			destroy_component(search);
			destroy_component(skipback);
			if_blocks[current_block_type_index].d();
			destroy_component(skipforward);
			if_blocks_1[current_block_type_index_1].d();
			destroy_each(each_blocks, detaching);
			destroy_component(plus);
			if (if_block2) if_block2.d();
			if (if_block3) if_block3.d();
			mounted = false;
			run_all(dispose);
		}
	};
}
const defaultImage = 'https://picsum.photos/id/237/300/300';

function formatTime(seconds) {
	const minutes = Math.floor(seconds / 60);
	const remainingSeconds = Math.floor(seconds % 60);
	return `${minutes}:${remainingSeconds.toString().padStart(2, '0')}`;
}

function instance($$self, $$props, $$invalidate) {
	let { props } = $$props;

	// State variables
	let player;

	let currentTime = 0;
	let duration = 0;
	let isPlaying = false;
	let searchQuery = '';
	let showSearchModal = false;
	let showApiKeyModal = false;
	let searchResults = [];
	let displayedResults = 5;
	let playlist = [];
	let currentVideoId = '';
	let isSearching = false;
	let youtubeApiKey = '';
	let volume = 50;
	let isPlayerReady = false;
	let currentTrackIndex = -1;
	let currentTrackInfo = null;
	let isInitializing = true;
	let thumbnailUrl = defaultImage;

	// Initialize YouTube Player
	onMount(() => {
		tryInitialize();
	});

	async function tryInitialize() {
		let retries = 0;
		const maxRetries = 3;

		async function attemptInitialization() {
			try {
				await loadYouTubeAPI();
				isInitializing = false;
			} catch(error) {
				console.error('Error loading YouTube API or initializing player:', error);

				if (retries < maxRetries) {
					retries++;
					console.log(`Retrying initialization (attempt ${retries}/${maxRetries})...`);
					setTimeout(attemptInitialization, 2000);
				} else {
					console.error('Max retries reached. Unable to initialize YouTube player.');
					isInitializing = false;
				}
			}
		}

		await attemptInitialization();
	}

	// Load YouTube API
	function loadYouTubeAPI() {
		return new Promise((resolve, reject) => {
				if (window.YT && window.YT.Player) {
					initializePlayer();
					resolve();
				}

				const tag = document.createElement('script');
				tag.src = 'https://www.youtube.com/iframe_api';

				tag.onload = () => {
					window.onYouTubeIframeAPIReady = () => {
						initializePlayer();
						resolve();
					};
				};

				tag.onerror = () => {
					reject(new Error('Failed to load YouTube API'));
				};

				const firstScriptTag = document.getElementsByTagName('script')[0];
				firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
			});
	}

	// Initialize Player
	function initializePlayer() {
		console.log('Initializing YouTube player');

		try {
			player = new YT.Player('youtube-player',
			{
					height: '0',
					width: '0',
					videoId: '',
					events: {
						onReady: event => {
							console.log('YouTube player is ready');
							isPlayerReady = true;
							setVolume(volume);
							isInitializing = false; // Clear isInitializing flag here!
						},
						onStateChange: onPlayerStateChange,
						onError: onPlayerError
					}
				});
		} catch(error) {
			console.error('Error initializing YouTube player:', error);
		}
	}

	// Handle Player State Change
	function onPlayerStateChange(event) {
		if (event.data === YT.PlayerState.PLAYING) {
			$$invalidate(2, isPlaying = true);

			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'playing';
			}

			updateTimeInfo();
		} else if (event.data === YT.PlayerState.PAUSED) {
			$$invalidate(2, isPlaying = false);

			if ('mediaSession' in navigator) {
				navigator.mediaSession.playbackState = 'paused';
			}
		} else if (event.data === YT.PlayerState.ENDED) {
			playNextTrack();
		}
	}

	function onPlayerError(event) {
		console.log('YouTube player error:', event.data);
		$$invalidate(2, isPlaying = false);
	}

	function updateTimeInfo() {
		if (player && player.getCurrentTime && player.getDuration) {
			$$invalidate(0, currentTime = player.getCurrentTime());
			$$invalidate(1, duration = player.getDuration());

			if (isPlaying) {
				setTimeout(updateTimeInfo, 1000);
			}
		}
	}

	async function searchYouTube() {
		if (!youtubeApiKey) {
			alert('Please enter a YouTube API key first');
			$$invalidate(5, showApiKeyModal = true);
			return;
		}

		if (!searchQuery.trim()) {
			alert('Please enter a search query');
			return;
		}

		$$invalidate(10, isSearching = true);

		try {
			const response = await fetch(`https://www.googleapis.com/youtube/v3/search?part=snippet&q=${encodeURIComponent(searchQuery)}&type=video&key=${youtubeApiKey}&maxResults=25`);
			if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
			const data = await response.json();

			$$invalidate(6, searchResults = data.items.map(item => ({
				title: item.snippet.title,
				artist: item.snippet.channelTitle,
				videoId: item.id.videoId
			})));
		} catch(error) {
			console.error('Error fetching YouTube data:', error);
			alert('An error occurred while searching. Please try again.');
			$$invalidate(6, searchResults = []);
		} finally {
			$$invalidate(10, isSearching = false);
		}
	}

	function loadMore() {
		$$invalidate(7, displayedResults += 5);
	}

	function addToPlaylist(track) {
		$$invalidate(8, playlist = [...playlist, track]);
	}

	function removeFromPlaylist(index) {
		$$invalidate(8, playlist = playlist.filter((_, i) => i !== index));

		if (index === currentTrackIndex) {
			if (playlist.length > 0) {
				playVideo(playlist[0].videoId);
			} else {
				stopPlayback();
			}
		} else if (index < currentTrackIndex) {
			currentTrackIndex--;
		}
	}

	function stopPlayback() {
		currentTrackIndex = -1;
		$$invalidate(9, currentVideoId = '');
		$$invalidate(2, isPlaying = false);
		if (player && player.stopVideo) player.stopVideo();
		$$invalidate(13, currentTrackInfo = null);

		if ('mediaSession' in navigator) {
			navigator.mediaSession.metadata = null;
		}
	}

	async function playVideo(videoId) {
		if (isInitializing) {
			console.log('YouTube player is still initializing. Please wait.');
			return;
		}

		if (!isPlayerReady || !player || !player.loadVideoById) {
			console.error('YouTube player is not fully initialized. Please wait.');
			return;
		}

		try {
			await player.loadVideoById(videoId);
			$$invalidate(9, currentVideoId = videoId);
			currentTrackIndex = playlist.findIndex(track => track.videoId === videoId);
			$$invalidate(13, currentTrackInfo = playlist.find(track => track.videoId === videoId) || searchResults.find(result => result.videoId === videoId) || null);

			if (currentTrackInfo) {
				console.log('Current track info updated:', currentTrackInfo);
				$$invalidate(14, thumbnailUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`);

				if ('mediaSession' in navigator) {
					navigator.mediaSession.metadata = new MediaMetadata({
							title: currentTrackInfo.title || 'Unknown',
							artist: currentTrackInfo.artist || 'Unknown',
							artwork: [
								{
									src: thumbnailUrl,
									sizes: '480x360',
									type: 'image/jpeg'
								}
							]
						});
				}
			} else {
				console.warn('Could not find track info for videoId:', videoId);
			}

			$$invalidate(2, isPlaying = true);
			updateTimeInfo(); // Start updating time info
		} catch(error) {
			console.error(`Error loading video: ${error.message}. Please try again.`);
			$$invalidate(2, isPlaying = false);
		}
	}

	function togglePlay() {
		if (!player) return;

		if (isPlaying) {
			player.pauseVideo();
			$$invalidate(2, isPlaying = false);
		} else if (currentVideoId) {
			player.playVideo();
			$$invalidate(2, isPlaying = true);
		} else if (playlist.length > 0) {
			playVideo(playlist[0].videoId);
		}
	}

	let previousVolume = null;

	function setVolume(value) {
		$$invalidate(12, volume = value);

		if (player && player.setVolume) {
			player.setVolume(volume);
			// This is just a placeholder as the actual implementation varies
		}
	}

	function playNextTrack() {
		if (playlist.length === 0) return;
		let nextIndex = (currentTrackIndex + 1) % playlist.length;
		playVideo(playlist[nextIndex].videoId);
	}

	function playPreviousTrack() {
		if (playlist.length === 0) return;

		let prevIndex = currentTrackIndex === 0
		? playlist.length - 1
		: currentTrackIndex - 1;

		playVideo(playlist[prevIndex].videoId);
	}

	function setApiKey() {
		if (youtubeApiKey.trim()) {
			$$invalidate(5, showApiKeyModal = false);
		} else {
			alert('Please enter a valid API key');
		}
	}

	function handleSearchYouTubeClick() {
		$$invalidate(4, showSearchModal = true);
	}

	function handleApiKeyModalClick() {
		$$invalidate(5, showApiKeyModal = true);
	}

	function toggleLyrics() {
	}

	function handleProgressKeydown(event) {
		if (!player || !player.getDuration) return;

		// Handle keyboard navigation
		if (event.key === 'ArrowLeft') {
			const newTime = Math.max(0, currentTime - 5); // Back 5 seconds
			player.seekTo(newTime, true);
			$$invalidate(0, currentTime = newTime);
			event.preventDefault();
		} else if (event.key === 'ArrowRight') {
			const newTime = Math.min(duration, currentTime + 5); // Forward 5 seconds
			player.seekTo(newTime, true);
			$$invalidate(0, currentTime = newTime);
			event.preventDefault();
		} else if (event.key === 'Enter' || event.key === ' ') {
			// Toggle play/pause on Enter or Space
			togglePlay();

			event.preventDefault();
		}
	}

	function handleProgressBarClick(event) {
		if (!player || !player.getDuration) return;
		const progressBar = event.currentTarget;
		const rect = progressBar.getBoundingClientRect();
		const clickPosition = (event.clientX - rect.left) / rect.width;
		const newTime = clickPosition * duration;
		player.seekTo(newTime, true);
		$$invalidate(0, currentTime = newTime);
	}

	function toggleMute() {
		if (volume === 0) {
			// Restore to previous volume or default to 50
			setVolume(previousVolume || 50);
		} else {
			// Store current volume and mute
			previousVolume = volume;

			setVolume(0);
		}
	}

	function input1_change_input_handler() {
		volume = to_number(this.value);
		$$invalidate(12, volume);
	}

	const input_handler = () => setVolume(volume);
	const click_handler = track => playVideo(track.videoId);
	const click_handler_1 = index => removeFromPlaylist(index);
	const click_handler_2 = () => $$invalidate(4, showSearchModal = false);

	function input_input_handler() {
		searchQuery = this.value;
		$$invalidate(3, searchQuery);
	}

	const keydown_handler = e => e.key === 'Enter' && searchYouTube();
	const click_handler_3 = result => playVideo(result.videoId);
	const click_handler_4 = result => addToPlaylist(result);
	const click_handler_5 = () => $$invalidate(5, showApiKeyModal = false);

	function input_input_handler_1() {
		youtubeApiKey = this.value;
		$$invalidate(11, youtubeApiKey);
	}

	$$self.$$set = $$props => {
		if ('props' in $$props) $$invalidate(31, props = $$props.props);
	};

	return [
		currentTime,
		duration,
		isPlaying,
		searchQuery,
		showSearchModal,
		showApiKeyModal,
		searchResults,
		displayedResults,
		playlist,
		currentVideoId,
		isSearching,
		youtubeApiKey,
		volume,
		currentTrackInfo,
		thumbnailUrl,
		searchYouTube,
		loadMore,
		addToPlaylist,
		removeFromPlaylist,
		playVideo,
		togglePlay,
		setVolume,
		playNextTrack,
		playPreviousTrack,
		setApiKey,
		handleSearchYouTubeClick,
		handleApiKeyModalClick,
		toggleLyrics,
		handleProgressKeydown,
		handleProgressBarClick,
		toggleMute,
		props,
		input1_change_input_handler,
		input_handler,
		click_handler,
		click_handler_1,
		click_handler_2,
		input_input_handler,
		keydown_handler,
		click_handler_3,
		click_handler_4,
		click_handler_5,
		input_input_handler_1
	];
}

class Component extends SvelteComponent {
	constructor(options) {
		super();
		init(this, options, instance, create_fragment, safe_not_equal, { props: 31 }, null, [-1, -1, -1]);
	}
}

export { Component as default };
