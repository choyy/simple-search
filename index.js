const siyuan = require("siyuan");

const sql_default_order_by = "order by case type \
 when 'd' then 1\
 when 'h' then 2\
 when 'i' then 3\
 when 'p' then 4\
 when 't' then 5\
 when 'b' then 6\
 when 'c' then 7\
 when 'm' then 8\
 when 'l' then 9\
 when 's' then 10\
 when 'html' then 11\
 when 'widget' then 12\
 when 'query_embed' then 13\
 when 'iframe' then 14\
 end, updated desc";
const type_order = {
    "d": " when 'd' then ",
    "h": " when 'h' then ",
    "i": " when 'i' then ",
    "p": " when 'p' then ",
    "t": " when 't' then ",
    "b": " when 'b' then ",
    "c": " when 'c' then ",
    "m": " when 'm' then ",
    "l": " when 'l' then ",
    "s": " when 's' then ",
}
const type_mapping = { // 定义思源块类型映射关系
    audioBlock: '',
    blockquote: 'b',
    codeBlock: 'c',
    databaseBlock: '',
    document: 'd',
    embedBlock: '',
    heading: 'h',
    htmlBlock: '',
    iframeBlock: '',
    list: 'l',
    listItem: 'i',
    mathBlock: 'm',
    paragraph: 'p',
    superBlock: 's',
    table: 't',
    videoBlock: '',
    widgetBlock: ''
};

let g_keywords = [];
function translateSearchInput(search_keywords) {
    if (search_keywords.length < 2 || search_keywords.match("^-[wqrs]") != null) {
        return search_keywords;
    }
    let input_text_items            = search_keywords.split(" ");
    let key_words                   = []; // 搜索关键词
    let excluded_key_words          = []; // 排除的关键词
    let options                     = ""; // 搜索选项
    let if_options_exist            = false;
    let if_excluded_key_words_exist = false;
    for (let i = 0; i < input_text_items.length; i++) {
        if (input_text_items[i] == "" || input_text_items[i] == "-") {
            continue;
        } else if (input_text_items[i].match(/^-[kKedhlptbsicmoOL1-6]+$/) != null) { // kK为当前文档搜索，e为扩展搜索，其他为块类型
            options += input_text_items[i].substring(1, input_text_items[i].length);
            if_options_exist = true;
        }
        else if (input_text_items[i].match(/^-.+/) != null) {
            excluded_key_words.push(input_text_items[i].substring(1, input_text_items[i].length));
            if_excluded_key_words_exist = true;
        }
        else {
            key_words.push(input_text_items[i]);
        }
    }
    g_keywords = key_words;
    if ((!if_options_exist) && (!if_excluded_key_words_exist)) {
        return "-w" + search_keywords; // 仅有关键词时使用关键词查询
    } else if ((!if_options_exist) && (if_excluded_key_words_exist)) {
        let query_syntax = "-q";  // 仅有关键词和排除关键词是使用查询语法查询
        for (let i = 0; i < key_words.length; i++) {
            query_syntax += " " + key_words[i];
        }
        for (let i = 0; i < excluded_key_words.length; i++) {
            query_syntax += " NOT " + excluded_key_words[i];
        }
        return query_syntax;
    }
    // 判断是否扩展范围搜索，若是则直接返回扩展范围搜索的sql语句
    if (options.match(/e/) != null) {
        let sql_extended_search = "select path from blocks where type ='d' ";
        let sql_content_like = "";
        for (let i = 0; i < key_words.length; i++) {
            sql_extended_search += "and path in (select path from blocks where content like '%" + key_words[i] + "%') ";
            sql_content_like += "content like '%" + key_words[i] + "%' or ";
        }
        for (let i = 0; i < excluded_key_words.length; i++) {
            sql_extended_search += "and path not in (select path from blocks where content like '%" + excluded_key_words[i] + "%') ";
        }
        return "-s" + "select * from blocks where path in (" +
            sql_extended_search + ") and (" + sql_content_like.slice(0, -4) + ") and type not rlike '^[libs]$' " + // l i b s块类型不是叶子节点，重复
            sql_default_order_by;
    }

    // 一般搜索模式
    // sql 首部分
    let sql_prefix = "select * from blocks where ";
    // sql 搜索关键词
    let sql_key_words = "";
    if (key_words.length != 0) {
        sql_key_words += "content like '%" + key_words[0] + "%' ";
        for (let i = 1; i < key_words.length; i++) {
            sql_key_words += "and content like '%" + key_words[i] + "%' ";
        }
    }
    for (let i = 0; i < excluded_key_words.length; i++) {
        sql_key_words += "and content not like '%" + excluded_key_words[i] + "%' ";
    }
    if (sql_key_words != "") {
        sql_key_words = "(" + sql_key_words + ") ";
    } else {
        return "-w"
    }
    // sql 是否在当前文档搜索
    let sql_current_doc = "";
    if (options.match(/[kK]/) != null) {  // 当前文档或带子文档搜索
        let current_doc_id = document.querySelector(".fn__flex-1.protyle:not(.fn__none)").childNodes[1].childNodes[0].childNodes[0].getAttribute("data-node-id");
        sql_current_doc = options.match(/k/) ? `and path like '%${current_doc_id}.sy' ` // 在当前文档搜索
                                             : `and path rlike '${current_doc_id}' `;   // 在当前文档及子文档搜索
        options = options.replace(/[kK]/g, "");
    } 
    // sql 筛选搜索块类型
    let sql_types      = options;
    let sql_type_rlike = ""; // sql筛选块的语句
    const type_handler = {
        // 搜索标准块类型的sql语句
        "dhlptbsicm": (types) => `type rlike '^[${types.replace(/[^dhlptbsicm]/g, "")}]$' `,
        // 搜索子标题的sql语句
        "1-6": (types) => `subtype rlike '^h[${types.replace(/[^\d]/g, "")}]$' `,
        // 搜索待办的sql语句
        "oO": (types) => {
            let todoType = !types.includes('O') ? "and markdown like '%[ ] %'" // o：仅搜索未完成待办
                         : !types.includes('o') ? "and markdown like '%[x] %'" // O：仅搜索已完成待办
                         : "and (markdown like '%[ ] %' or markdown like '%[x] %')"; // oO：搜索所有待办
            return `(subtype like 't' and type not like 'l' ${todoType}) `;
        },
        // 搜索带链接的块的sql语句
        "L": () => `(type rlike '^[htp]$' and markdown like '%[%](%)%') `
    };
    for (let key in type_handler) {
        const regex = new RegExp(`[${key}]`, 'g');
        if (sql_types.match(regex)) {
            if (sql_type_rlike != "") sql_type_rlike += "or ";
            sql_type_rlike += type_handler[key](sql_types);
        }
    }
    if (sql_type_rlike == "") { // 未指定搜索块类型时，选择“搜索类型”中开启的块类型
        let types = "";
        let search_types = window.siyuan.storage['local-searchdata'].types;
        for (const key in search_types) {
            if (search_types[key]) types += type_mapping[key];
        }
        sql_type_rlike = `type rlike '^[${types}]$' `;
    }
    sql_type_rlike = "and (" + sql_type_rlike + ") ";
    sql_types = sql_types.replace(/[oOL1-6]/g, "");
    // sql 排序
    let sql_order_by = "order by case type";
    if (sql_types != "") {
        for (let i = 0; i < sql_types.length; i++) {
            sql_order_by += type_order[sql_types[i]] + i.toString();
        }
        sql_order_by += " end, updated desc";
    } else {
        sql_order_by = sql_default_order_by;
    }

    // 完整sql语句
    return "-s" + sql_prefix + sql_key_words + sql_type_rlike + sql_current_doc + sql_order_by;
}
let g_last_search_method = -1;
function switchSearchMethod(i) {
    if (g_last_search_method != i) {
        // 需考虑搜索页签和搜索面板同时打开的情况，优先选择搜索面板的搜索框
        const searchSyntaxCheck = document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #searchSyntaxCheck')
                               || document.querySelector('#layouts #searchSyntaxCheck');
        searchSyntaxCheck.click();
        document.querySelector("#commonMenu").lastChild.children[i].click();
        g_last_search_method = i;
    }
}

let g_changed_user_groupby = false;      // 记录是否切换过分组
function changeGroupBy(i){               // i = 0 默认分组，i = 1 按文档分组
    // 需考虑搜索页签和搜索面板同时打开的情况，优先选择搜索面板的搜索框
    const searchMore = document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #searchMore')
                    || document.querySelector('#layouts #searchMore');
    if (i == 0 && g_changed_user_groupby && window.siyuan.storage['local-searchdata'].group == 0) {         // 若分组被切换过，且默认不分组，则切换不分组
        searchMore.click();
        document.querySelector("#commonMenu").lastChild.children[1].children[2].firstChild.firstChild.click();
        g_changed_user_groupby = false;
    } else if (i == 1 && !g_changed_user_groupby && window.siyuan.storage['local-searchdata'].group == 0) { // 若分组没切换过，且默认不分组，则按文档分组
        searchMore.click();
        document.querySelector("#commonMenu").lastChild.children[1].children[2].firstChild.lastChild.click();
        g_changed_user_groupby = true;
    }
}

function highlightKeywords(search_list_text_nodes, keyword, highlight_type) {
    const str = keyword.trim().toLowerCase();
    const ranges = search_list_text_nodes // 查找所有文本节点是否包含搜索词
        .map((el) => {
            const text = el.textContent.toLowerCase();
            const indices = [];
            let startPos = 0;
            while (startPos < text.length) {
                const index = text.indexOf(str, startPos);
                if (index === -1) break;
                indices.push(index);
                startPos = index + str.length;
            }
            return indices.map((index) => {
                const range = document.createRange();
                range.setStart(el, index);
                range.setEnd(el, index + str.length);
                return range;
            });
        });
    const searchResultsHighlight = new Highlight(...ranges.flat()); // 创建高亮对象
    CSS.highlights.set(highlight_type, searchResultsHighlight);     // 注册高亮
}

let g_observer;
let g_search_keywords = "";
let g_highlight_keywords = false;
class SimpleSearch extends siyuan.Plugin {
    inputSearchEvent() { // 保存关键词，确保思源搜索关键词为输入的关键词，而不是翻译后的sql语句
        // 需考虑搜索页签和搜索面板同时打开的情况，优先选择搜索面板的搜索框
        const searchInput = document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #searchInput')
                         || document.querySelector('#layouts #searchInput')
        const simpleSearchInput = document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #simpleSearchInput')
                               || document.querySelector('#layouts #simpleSearchInput')
        if (/^#.*#$/.test(searchInput.value)  // 多次点击标签搜索时更新搜索框关键词
            && searchInput.value != simpleSearchInput.value) {
            simpleSearchInput.value = searchInput.value;
            simpleSearchInput.focus();  // 聚焦到输入框
            simpleSearchInput.select(); // 选择框内内容
            g_search_keywords = searchInput.value;
        }
        window.siyuan.storage["local-searchdata"].k = g_search_keywords;
    }
    loadedProtyleStaticEvent() {    // 在界面加载完毕后高亮关键词
        CSS.highlights.clear();     // 清除上个高亮
        if (g_highlight_keywords) { // 判断是否需要高亮关键词
            // 需考虑搜索页签和搜索面板同时打开的情况，优先选择搜索面板的搜索框
            const search_list = document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #searchList')
                             || document.querySelector('#layouts #searchList'); // 搜索结果列表的节点
            if (search_list == null) return; // 判断是否存在搜索界面
            const search_list_text_nodes = Array.from(search_list.querySelectorAll(".b3-list-item__text"), el => el.firstChild); // 获取所有具有 b3-list-item__text 类的节点的文本子节点
            g_keywords.forEach((keyword) => {
                highlightKeywords(search_list_text_nodes, keyword, "highlight-keywords-search-list");
            });
            const search_preview = document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #searchPreview')
                                || document.querySelector('#layouts #searchPreview'); // 搜索预览内容的节点
            const tree_walker = document.createTreeWalker(search_preview.children[1].children[0], NodeFilter.SHOW_TEXT);     // 创建 createTreeWalker 迭代器，用于遍历文本节点，保存到一个数组
            const search_preview_text_nodes = [];
            let current_node = tree_walker.nextNode();
            while (current_node) {
                if (current_node.textContent.trim().length > 1) {
                    search_preview_text_nodes.push(current_node);
                }
                current_node = tree_walker.nextNode();
            }
            g_keywords.forEach((keyword) => {
                highlightKeywords(search_preview_text_nodes, keyword, "highlight-keywords-search-preview");
            });
        }
    }
    onLayoutReady() {
        // 选择需要观察变动的节点
        const global_search_node = document.querySelector("body");
        const tab_search_node = document.querySelector(".layout__center");
        // 监视子节点的增减
        const observer_conf = { childList: true };
        // 当观察到变动时执行的回调函数
        // 即当搜索界面打开时，插入新搜索框，隐藏原搜索框，然后将新搜索框内容转成sql后填入原搜索框
        const input_event = new InputEvent("input");
        const operationsAfterOpenSearch = function () {
            g_last_search_method = -1; // 每次打开搜索都要设置搜索方法
            // 插入新搜索框，隐藏原搜索框
            let originalSearchInput = // 需考虑搜索页签和搜索面板同时打开的情况，优先选择搜索面板的搜索框
                document.querySelector('#tooltip~div[data-key="dialog-globalsearch"] #searchInput')
                || document.querySelector('#layouts #searchInput');
            let simpleSearchInput = originalSearchInput.cloneNode();
            simpleSearchInput.id = "simpleSearchInput";
            simpleSearchInput.value = "";
            originalSearchInput.before(simpleSearchInput);
            simpleSearchInput.nextSibling.onclick = function () { // 设置清空按钮
                simpleSearchInput.value = "";
                simpleSearchInput.focus();
            }
            const input_event_func = function () {
                g_highlight_keywords = false;
                g_search_keywords = simpleSearchInput.value;
                if (g_search_keywords.length < 2) {
                    switchSearchMethod(0);
                    originalSearchInput.value = g_search_keywords;
                } else {
                    let input_translated = translateSearchInput(g_search_keywords);
                    switch (input_translated.substring(0, 2)) {
                        case "-w": switchSearchMethod(0); break;
                        case "-q": switchSearchMethod(1); break;
                        case "-s": switchSearchMethod(2); break;
                        case "-r": switchSearchMethod(3); break;
                    }
                    originalSearchInput.value = input_translated.slice(2, input_translated.length);
                    if (input_translated.substring(0, 2) == "-s") {
                        g_highlight_keywords = true;
                        if (input_translated.match(/'\^\[libs\]\$'/g) != null) { // 若是扩展搜索，按文档分组
                            changeGroupBy(1);
                        } else { // 否则切换默认分组
                            changeGroupBy(0);
                        }
                    }
                }
                originalSearchInput.dispatchEvent(input_event);
            }
            const keyboard_event_func = function (event) {
                switch (event.keyCode) {
                    case 13:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 13, "code": "KeyEnter", "key": "Enter" }));
                        break;
                    case 38:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 38, "code": "KeyArrowUp", "key": "ArrowUp" }));
                        return false; // 禁用方向键原跳到行首功能
                    case 40:
                        originalSearchInput.dispatchEvent(new KeyboardEvent("keydown", { "keyCode": 40, "code": "KeyArrowDown", "key": "ArrowDown" }));
                        return false; // 禁用方向键原跳到行尾功能
                }
            }

            simpleSearchInput.value = originalSearchInput.value; // 1、原搜索框关键词为保存的g_search_keywords  2、确保点击标签搜索时不被影响
            input_event_func();
            simpleSearchInput.focus();  // 聚焦到输入框
            simpleSearchInput.select(); // 选择框内内容

            // 当在输入框中按下按键的时候，将搜索框内容转成sql后填入原搜索框
            g_search_keywords = simpleSearchInput.value;
            simpleSearchInput.oninput = input_event_func; // 监听input事件
            simpleSearchInput.onkeydown = keyboard_event_func; // enter键打开搜索结果，上下键选择
        }.bind(this);
        const openSearchCallback = function (mutationsList) {
            for (let i = 0; i < mutationsList.length; i++) {
                if (mutationsList[i].addedNodes.length == 0) return;
                if (mutationsList[i].addedNodes[0].getAttribute('data-key') == "dialog-globalsearch") {// 判断全局搜索
                    operationsAfterOpenSearch(); 
                    document.querySelector(`#tooltip~div[data-key="dialog-globalsearch"] #searchOpen`).onclick = function () { // 确保按下在页签打开时搜索关键词不变
                        document.querySelector('#layouts #searchInput').value = g_search_keywords;
                    }.bind(this);
                    return;
                } else if (mutationsList[i].addedNodes[0].className == "fn__flex-1 fn__flex"  // 判断搜索页签
                    && mutationsList[i].addedNodes[0].innerText == "搜索") {
                    operationsAfterOpenSearch(); return;
                } 
            }
        }.bind(this);

        this.eventBus.on("input-search", this.inputSearchEvent);
        this.eventBus.on("loaded-protyle-static", this.loadedProtyleStaticEvent);

        // 创建一个观察器实例并传入回调函数
        g_observer = new MutationObserver(openSearchCallback);
        // 开始观察目标节点
        g_observer.observe(global_search_node, observer_conf);
        g_observer.observe(tab_search_node, observer_conf);

        // 在思源启动时，判断是否已经打开搜索页签，如果已经打开，则直接执行操作
        if (document.querySelector('#layouts #searchInput')
            && !document.querySelector('#layouts #simpleSearchInput')) {
            operationsAfterOpenSearch();
        }

        console.log("simple search start...")
    }

    onunload() {
        // 停止观察目标节点
        g_observer.disconnect();
        this.eventBus.off("input-search", this.inputSearchEvent);
        this.eventBus.off("loaded-protyle-static", this.loadedProtyleStaticEvent);
        const simpleSearchInput = document.querySelector('#layouts #simpleSearchInput');
        if (simpleSearchInput) {
            simpleSearchInput.remove(); // 删除搜索框
        }
        console.log("simple search stop...")
    }
};

module.exports = {
    default: SimpleSearch,
};