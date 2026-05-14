const { Client, GatewayIntentBits, Partials, EmbedBuilder } = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const dataPath = path.join(__dirname, 'data.json');
let botData = { authChannelId: null, authMsgId: null, rulesChannelId: null, rulesMsgId: null };
if (fs.existsSync(dataPath)) {
    try {
        botData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    } catch (e) {
        console.error('[SYSTEM] Ошибка чтения data.json', e);
    }
}

function saveData() {
    fs.writeFileSync(dataPath, JSON.stringify(botData, null, 2));
}
// Мини-сервер для Render (бесплатный Web Service требует открытый порт)
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('Bot is running');
}).listen(PORT, () => {
    console.log(`[SYSTEM] HTTP сервер запущен на порту ${PORT}`);
});

// Инициализация клиента с нужными правами
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMessageReactions,
        GatewayIntentBits.GuildMembers,
    ],
    partials: [Partials.Message, Partials.Channel, Partials.Reaction],
});

const TOKEN = process.env.DISCORD_TOKEN;
const CONFIG = {
    redColor: 0xFF0000,
    rulesMsgId: '1503715441577562223',
    memberRoleId: '1503693782871314482',
    adminChannelId: '1503722511932588124',
    publicChannelId: '1503691844016406558',
    roleRequestChannelId: '1503691024579559458',
    contractChannelId: '1503727272799109203',
    vzpChannelId: '1503727959054221343',
    logChannelId: '1503722511932588124', // Канал для логирования действий бота
    // Роли для прав доступа
    adminRoleId: '1503693026814328864', // Все команды
    moderatorRoleIds: ['1504134285857259690', '1503693782871314482'], // Модерация + объявления (массив для нескольких ролей)
    announcementRoleIds: ['1504134644600275187', '1504144608517689445', '1504144783105589440', '1504134935282188409', '1504145208508420176', '1504145305082265731'], // Только объявления (массив для нескольких ролей)
};

const PREFIX = '!';
const trackedMessages = new Map();
const userWarns = new Map(); // Система варнов: userId -> количество варнов
const ANNOUNCEMENTS = {
    contract: 'Кого выбрать в контракт?',
    vzp: 'Кто будет играть взп?',
};

// Роли по реакциям: emoji -> roleId
const ROLE_REACTIONS = {
    '⚔️': 'ID_РОЛИ_ВОИН',
};

// Функция логирования в канал
async function logToChannel(message) {
    try {
        const logChannel = await client.channels.fetch(CONFIG.logChannelId).catch(() => null);
        if (logChannel && logChannel.isTextBased()) {
            await logChannel.send(`📝 ${message}`);
        }
    } catch (error) {
        console.error('[SYSTEM] Ошибка логирования:', error);
    }
}

console.log('[SYSTEM] Запуск бота...');
logToChannel('🤖 Бот запускается...');

// Функция проверки прав доступа (поддерживает как строку, так и массив ролей)
function hasPermission(member, requiredRoleIds) {
    if (Array.isArray(requiredRoleIds)) {
        return requiredRoleIds.some(roleId => member.roles.cache.has(roleId)) || member.permissions.has('Administrator');
    }
    return member.roles.cache.has(requiredRoleIds) || member.permissions.has('Administrator');
}

process.on('unhandledRejection', (error) => {
    console.error('[SYSTEM] Необработанная ошибка промиса:', error);
});

process.on('uncaughtException', (error) => {
    console.error('[SYSTEM] Необработанное исключение:', error);
});

client.once('clientReady', async () => {
    console.log(`[SYSTEM] Секретарь ${client.user.tag} заступил на пост.`);
    await logToChannel(`🤖 Бот ${client.user.tag} успешно запущен и готов к работе!`);
    // Установка статуса бота
    client.user.setActivity('за сервером AGGRESSED', { type: 'WATCHING' });
});

client.on('error', (error) => {
    console.error('[SYSTEM] Ошибка клиента:', error);
});

client.on('messageCreate', async (message) => {
    if (message.author.bot) return;
    if (!message.content.startsWith(PREFIX)) return;

    console.log(`[SYSTEM] Admin command from ${message.author.tag}: ${message.content}`);
    await logToChannel(`👤 ${message.author.tag} использовал команду: \`${message.content}\``);

    // Удаляем команду пользователя
    await message.delete().catch(err => console.error('[SYSTEM] Ошибка при удалении команды:', err));

    const args = message.content.slice(PREFIX.length).trim().split(/\s+/);
    const normalized = args[0].toLowerCase();
    const requestedCount = args[1] ? parseInt(args[1], 10) : null;
    const customText = args.slice(2).join(' ');

    // Проверка прав доступа
    const member = message.guild.members.cache.get(message.author.id);
    if (!member) return;

    const isAdmin = hasPermission(member, CONFIG.adminRoleId);
    const isModerator = hasPermission(member, CONFIG.moderatorRoleIds);
    const canAnnounce = hasPermission(member, CONFIG.announcementRoleIds);

    if (normalized === 'help' || normalized === 'помощь') {
        let helpText = '**ОСНОВНЫЕ КОМАНДЫ:**\n';

        if (canAnnounce || isModerator || isAdmin) {
            helpText += '!contract [текст] — объявление контракта\n!vzp [кол-во] [текст] — объявление взп\n';
        }

        if (isModerator || isAdmin) {
            helpText += '!warn @user причина — выдать варн\n!warnscount @user — количество варнов\n!warnreset @user — сбросить варны\n!poll вопрос | опция1 | опция2 — голосование\n!announce текст — объявление\n!remind время текст — напоминание\n';
        }

        if (isAdmin) {
            helpText += '\n**АДМИНСКИЕ КОМАНДЫ:**\n!status текст — установить статус бота\n!setup_auth #канал1 #канал2 — отправить сообщения приветствия и правил\n';
        }

        return message.channel.send(helpText);
    }

    if (normalized === 'setup_auth' && isAdmin) {
        const authChannel = message.mentions.channels.first();
        const rulesChannel = message.mentions.channels.last();
        if (!authChannel || !rulesChannel || authChannel.id === rulesChannel.id) {
            return message.channel.send('❌ Укажи два разных канала: !setup_auth #канал_вступления #канал_правил');
        }

        const authText = `[ ＡＵＴＨＥＮＴＩＣＡＴＩＯＮ ]

🩸 Добро пожаловать в ряды AGGRESSED 🩸

Чтобы получить доступ к штабу и арсеналу, тебе необходимо пройти идентификацию личности.

⚠️ ТРЕБОВАНИЯ К ПРОФИЛЮ:
Твой никнейм на сервере должен строго соответствовать регламенту:
[ Имя Фамилия | Отдел | Ранг ]
Пример: [ Ivan Ivanov | Tactical | 1 ]

📑 ИНСТРУКТАЖ:
Перед началом работы обязан ознакомиться с кодексом чести и правилами:
📜 ОЗНАКОМИТЬСЯ С УСТАВОМ - https://discord.com/channels/1503691023514079342/1504078856322027581

Нажми на реакцию 🩸 ниже, чтобы подтвердить, что ты настроил профиль и готов к службе.`;

        const rulesText = `🟥 [ ＣＯＭＭＵＮＩＴＹ  ＲＵＬＥＳ ] 🟥
1. ВЗАИМООТНОШЕНИЯ (Zero Tolerance)

1.1. Оскорбление родных. Любое упоминание родителей или семьи в негативном ключе — МГНОВЕННЫЙ БАН без права обжалования.

1.2. Токсичность. Мы здесь, чтобы играть и развивать AGGRESSED. Неадекватное поведение, постоянный «срач» и провокации внутри состава караются киком.

1.3. Дискриминация. Запрещены любые высказывания, задевающие нацию, религию или ориентацию участников.

2. КАНАЛЫ СВЯЗИ (Structure)

2.1. Оффтоп. Не спамьте в рабочих каналах. Для этого есть канал #оффтоп.

2.2. Голосовой этикет. В каналах [ ＶＯＩＣＥ ] запрещено использовать Soundpad (без разрешения), кричать или перебивать старших во время собраний.

2.3. Реклама. Любые ссылки на сторонние дискорд-серверы или услуги без согласия руководства — бан.

3. БЕЗОПАСНОСТЬ (Security)

3.1. Слив инфы. Пересылка скриншотов из закрытых каналов или переписок руководства третьим лицам — занесение в чёрный список проекта.

3.2. Фейковые аккаунты. Нахождение со вторых аккаунтов без предупреждения запрещено.

Нажми на реакцию 🩸 ниже, чтобы подтвердить принятие условий.`;

        try {
            const authMsg = await authChannel.send(authText);
            await authMsg.react('🩸');
            
            const rulesMsg = await rulesChannel.send(rulesText);
            await rulesMsg.react('🩸');

            botData.authChannelId = authChannel.id;
            botData.authMsgId = authMsg.id;
            botData.rulesChannelId = rulesChannel.id;
            botData.rulesMsgId = rulesMsg.id;
            saveData();

            return message.channel.send('✅ Сообщения успешно отправлены, и их ID сохранены в базу!');
        } catch (error) {
            console.error('[SYSTEM] Ошибка при отправке сообщений авторизации:', error);
            return message.channel.send('❌ Ошибка при отправке. Проверьте права бота в указанных каналах.');
        }
    }

    // Проверка прав для объявлений
    if ((normalized === 'contract' || normalized === 'vzp') && !(canAnnounce || isModerator || isAdmin)) {
        return message.channel.send('❌ Недостаточно прав для объявлений');
    }

    // Проверка прав для модерации
    if ((normalized === 'warn' || normalized === 'warnscount' || normalized === 'warnreset' || normalized === 'poll' || normalized === 'announce' || normalized === 'remind') && !(isModerator || isAdmin)) {
        return message.channel.send('❌ Недостаточно прав для модерации');
    }

    // Проверка прав для админских команд
    if (normalized === 'status' && !isAdmin) {
        return message.channel.send('❌ Недостаточно прав для изменения статуса');
    }

    // ВАРНЫ
    if (normalized === 'warn') {
        const user = message.mentions.users.first();
        if (!user) return message.channel.send('Укажи пользователя: !warn @user причина');
        const reason = args.slice(2).join(' ') || 'Причина не указана';

        if (!userWarns.has(user.id)) {
            userWarns.set(user.id, 0);
        }
        const warnCount = userWarns.get(user.id) + 1;
        userWarns.set(user.id, warnCount);

        await message.channel.send(`⚠️ ${user.tag} получил варн! Причина: ${reason}\nВарнов: ${warnCount}/3`);
        await user.send(`⚠️ Ты получил варн на сервере AGGRESSED!\nПричина: ${reason}\nВарнов: ${warnCount}/3`).catch(() => null);
        console.log(`[SYSTEM] ${user.tag} получил варн #${warnCount}`);
        await logToChannel(`⚠️ ${message.author.tag} выдал варн ${user.tag} (#${warnCount}). Причина: ${reason}`);
        return;
    }

    if (normalized === 'warnscount') {
        const user = message.mentions.users.first();
        if (!user) return message.channel.send('Укажи пользователя: !warnscount @user');
        const count = userWarns.get(user.id) || 0;
        return message.channel.send(`📊 ${user.tag} имеет ${count} варнов`);
    }

    if (normalized === 'warnreset') {
        const user = message.mentions.users.first();
        if (!user) return message.channel.send('Укажи пользователя: !warnreset @user');
        userWarns.delete(user.id);
        return message.channel.send(`✅ Варны ${user.tag} сброшены`);
    }

    // УТИЛИТЫ

    if (normalized === 'poll') {
        const pollText = customText;
        if (!pollText.includes('|')) return message.channel.send('Синтаксис: !poll вопрос | опция1 | опция2');

        const parts = pollText.split('|').map(p => p.trim());
        const question = parts[0];
        const options = parts.slice(1);
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

        if (options.length > 5) return message.channel.send('Максимум 5 опций');

        const pollEmbed = new EmbedBuilder()
            .setColor(CONFIG.redColor)
            .setTitle(`📋 ${question}`)
            .setDescription(options.map((opt, i) => `${emojis[i]} ${opt}`).join('\n'))
            .setTimestamp();

        const pollMsg = await message.channel.send({ embeds: [pollEmbed] });
        for (let i = 0; i < options.length; i++) {
            await pollMsg.react(emojis[i]);
        }
        return;
    }

    if (normalized === 'announce') {
        const announceEmbed = new EmbedBuilder()
            .setColor(CONFIG.redColor)
            .setTitle('📢 ОБЪЯВЛЕНИЕ')
            .setDescription(customText || 'Объявление пусто')
            .setTimestamp();
        await message.channel.send({ content: '@everyone', embeds: [announceEmbed] });
        return message.channel.send('✅ Объявление отправлено');
    }

    if (normalized === 'remind') {
        const timeStr = args[1];
        const remindText = args.slice(2).join(' ') || 'Напоминание';
        if (!timeStr) return message.channel.send('Синтаксис: !remind 60 (секунды) текст');

        const time = parseInt(timeStr, 10) * 1000;
        if (isNaN(time)) return message.channel.send('Укажи время в секундах');

        await message.channel.send(`⏰ Напоминание установлено на ${timeStr}с`);
        setTimeout(() => {
            message.channel.send(`⏰ <@${message.author.id}> Напоминание: ${remindText}`).catch(() => null);
        }, time);
        return;
    }

    if (!Object.prototype.hasOwnProperty.call(ANNOUNCEMENTS, normalized)) {
        console.log(`[SYSTEM] Неизвестная команда: ${normalized}`);
        await logToChannel(`❓ ${message.author.tag} ввел неизвестную команду: \`${normalized}\``);
        return message.channel.send('Неизвестная команда. Напиши !help, чтобы увидеть список команд.');
    }

    let threshold = null;
    if (requestedCount !== null) {
        if (Number.isNaN(requestedCount) || requestedCount <= 0) {
            return message.channel.send('Укажи корректное положительное число после команды, например: !vzp 4');
        }
        threshold = requestedCount;
    }

    // Выбираем канал в зависимости от типа команды
    let targetChannelId = CONFIG.publicChannelId; // значение по умолчанию
    if (normalized === 'contract') {
        targetChannelId = CONFIG.contractChannelId;
    } else if (normalized === 'vzp') {
        targetChannelId = CONFIG.vzpChannelId;
    }

    const publicChannel = await client.channels.fetch(targetChannelId).catch((error) => {
        console.error('[SYSTEM] Ошибка fetch public channel:', error);
        return null;
    });
    if (!publicChannel || !publicChannel.isTextBased()) {
        console.log('[SYSTEM] Целевой канал не найден или не текстовый');
        return message.channel.send('Не удалось найти целевой канал. Проверь CONFIG.');
    }

    // Использую кастомный текст если он есть, иначе берю из ANNOUNCEMENTS
    const announcementTitle = customText || ANNOUNCEMENTS[normalized];

    // Красивый эмбед для объявления
    const embed = new EmbedBuilder()
        .setColor(CONFIG.redColor)
        .setTitle(`⚔️ ${announcementTitle}`)
        .setDescription(`Нажми на реакцию ниже, чтобы выразить свой интерес.\n\n**Участники:**`)
        .setFooter({ text: threshold ? `Необходимо ${threshold} участников` : 'Ожидание участников...' })
        .setTimestamp();

    // Отправляем сообщение с @everyone
    const sentMessage = await publicChannel.send({ content: '@everyone', embeds: [embed] });
    await sentMessage.react('✅');
    trackedMessages.set(sentMessage.id, { threshold, type: normalized, participants: [] });

    const thresholdText = threshold ? ` Порог: ${threshold} реакции.` : '';
    const channelName = normalized === 'contract' ? 'контракт' : normalized === 'vzp' ? 'взп' : 'публичный';
    console.log(`[SYSTEM] Сообщение [${normalized}] отправлено в канал ${targetChannelId} с ID ${sentMessage.id} и порогом ${threshold}`);
    await logToChannel(`📢 ${message.author.tag} создал объявление ${normalized.toUpperCase()}: ${sentMessage.url}${thresholdText}`);
    await message.channel.send(`Сообщение отправлено в канал ${channelName} и отслеживается: ${sentMessage.url}${thresholdText}`);
});

async function handleReactionUpdate(reaction, user, action) {
    if (user.bot) return;

    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('[SYSTEM] Ошибка при получении реакции:', error);
            return;
        }
    }

    const message = reaction.message;
    const emoji = reaction.emoji.name;

    // Проверка авторизации (вступления и правил)
    if ((message.id === botData.authMsgId || message.id === botData.rulesMsgId) && emoji === '🩸') {
        const guild = message.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        // Если действие Удалено, нам нечего делать, просто возвращаемся.
        // Роль снимать за удаление реакции не просили, но можно добавить если надо.
        if (action === 'Удалено') return;

        try {
            // Проверяем, есть ли реакция на обоих сообщениях
            let authReacted = false;
            let rulesReacted = false;

            if (botData.authChannelId && botData.authMsgId) {
                const aCh = await guild.channels.fetch(botData.authChannelId).catch(() => null);
                if (aCh) {
                    const aMsg = await aCh.messages.fetch(botData.authMsgId).catch(() => null);
                    if (aMsg) {
                        const reactionObj = aMsg.reactions.cache.get('🩸');
                        if (reactionObj) {
                            const users = await reactionObj.users.fetch();
                            authReacted = users.has(user.id);
                        }
                    }
                }
            }

            if (botData.rulesChannelId && botData.rulesMsgId) {
                const rCh = await guild.channels.fetch(botData.rulesChannelId).catch(() => null);
                if (rCh) {
                    const rMsg = await rCh.messages.fetch(botData.rulesMsgId).catch(() => null);
                    if (rMsg) {
                        const reactionObj = rMsg.reactions.cache.get('🩸');
                        if (reactionObj) {
                            const users = await reactionObj.users.fetch();
                            rulesReacted = users.has(user.id);
                        }
                    }
                }
            }

            if (authReacted && rulesReacted) {
                const role = guild.roles.cache.get(CONFIG.memberRoleId);
                if (!role) {
                    console.error(`[SYSTEM] Роль с ID ${CONFIG.memberRoleId} не найдена`);
                    return;
                }

                if (!member.roles.cache.has(role.id)) {
                    await member.roles.add(role);
                    const welcomeEmbed = new EmbedBuilder()
                        .setColor(CONFIG.redColor)
                        .setTitle('⚔️ ПРИНЯТ В СОСТАВ')
                        .setDescription(`Приветствую, **${user.username}**. Ты подтвердил знание устава и прошел идентификацию.\nТвой доступ активирован. Не подведи организацию.`)
                        .setTimestamp();

                    await user.send({ embeds: [welcomeEmbed] }).catch(() => null);
                    console.log(`[SYSTEM] Роль ${role.name} выдана пользователю ${user.tag} (прошел 2 этапа)`);
                    await logToChannel(`🎖️ ${user.tag} получил роль ${role.name} после принятия правил и вступления`);
                }
            } else {
                // Подсказываем, чего не хватает
                if (message.id === botData.authMsgId && !rulesReacted) {
                    await user.send('Отлично! Теперь тебе нужно прочитать и принять правила в канале правил.').catch(() => null);
                } else if (message.id === botData.rulesMsgId && !authReacted) {
                    await user.send('Отлично! Теперь тебе нужно ознакомиться с инструктажем и подтвердить его в канале вступления.').catch(() => null);
                }
            }
        } catch (error) {
            console.error('[SYSTEM] Ошибка при проверке реакций авторизации:', error);
        }
        return;
    }

    // Обработка ролей по реакциям в канале запроса ролей
    if (message.channel.id === CONFIG.roleRequestChannelId && ROLE_REACTIONS[emoji]) {
        const guild = message.guild;
        const member = await guild.members.fetch(user.id).catch(() => null);
        if (!member) return;

        const roleId = ROLE_REACTIONS[emoji];
        const role = guild.roles.cache.get(roleId);
        if (!role) {
            console.error(`[SYSTEM] Роль с ID ${roleId} не найдена`);
            return;
        }

        try {
            if (action === 'Добавлено') {
                await member.roles.add(role);
                console.log(`[SYSTEM] Роль ${role.name} выдана пользователю ${user.tag}`);
                await logToChannel(`➕ ${user.tag} получил роль ${role.name} через реакцию`);
            } else if (action === 'Удалено') {
                await member.roles.remove(role);
                console.log(`[SYSTEM] Роль ${role.name} снята с пользователя ${user.tag}`);
                await logToChannel(`➖ ${user.tag} потерял роль ${role.name} через реакцию`);
            }
        } catch (error) {
            console.error(`[SYSTEM] Ошибка при ${action.toLowerCase()} роли ${role.name}:`, error);
        }
        return; // Не отправляем уведомление в админский канал для ролей
    }

    const trackedInfo = trackedMessages.get(message.id);
    if (!trackedInfo && message.id !== CONFIG.rulesMsgId) return;

    // Обработка участников в tracked сообщениях (contract/vzp)
    if (trackedInfo && trackedInfo.type && emoji === '✅') {
        if (action === 'Добавлено' && !trackedInfo.participants.includes(user.id)) {
            trackedInfo.participants.push(user.id);
        } else if (action === 'Удалено') {
            trackedInfo.participants = trackedInfo.participants.filter(id => id !== user.id);
        }

        // Обновляем описание эмбеда со списком участников
        const guild = message.guild;
        const participantList = trackedInfo.participants.map(id => `<@${id}>`).join(' ');
        const updatedEmbed = new EmbedBuilder()
            .setColor(CONFIG.redColor)
            .setTitle(message.embeds[0]?.title || 'Объявление')
            .setDescription(`Нажми на реакцию ниже, чтобы выразить свой интерес.\n\n**Участники (${trackedInfo.participants.length}):**\n${participantList || '*(ещё никого)*'}`)
            .setFooter({ text: trackedInfo.threshold ? `Необходимо ${trackedInfo.threshold} участников` : 'Ожидание участников...' })
            .setTimestamp();

        await message.edit({ embeds: [updatedEmbed] }).catch(err =>
            console.error('[SYSTEM] Ошибка при обновлении эмбеда:', err)
        );

        console.log(`[SYSTEM] Участников в сообщении: ${trackedInfo.participants.length}`);
        await logToChannel(`👥 В объявлении ${trackedInfo.type.toUpperCase()} теперь ${trackedInfo.participants.length} участников`);

        // Проверяем достижение порога
        if (trackedInfo.threshold && trackedInfo.participants.length >= trackedInfo.threshold) {
            trackedMessages.delete(message.id);
            const finalList = trackedInfo.participants.map(id => `<@${id}>`).join('\n');

            const adminChannel = await client.channels.fetch(CONFIG.adminChannelId).catch(() => null);
            if (adminChannel && adminChannel.isTextBased()) {
                const resultEmbed = new EmbedBuilder()
                    .setColor(CONFIG.redColor)
                    .setTitle(`✅ Порог ${trackedInfo.threshold} достигнут!`)
                    .setDescription(`**${message.embeds[0]?.title || 'Объявление'}**\n\n**Участники:**\n${finalList}`)
                    .setTimestamp();

                await adminChannel.send({ embeds: [resultEmbed] });
                await logToChannel(`🎯 Порог ${trackedInfo.threshold} достигнут в объявлении ${trackedInfo.type.toUpperCase()}! Участников: ${trackedInfo.participants.length}`);

                await message.delete().catch(err =>
                    console.error('[SYSTEM] Ошибка при удалении сообщения:', err)
                );
            }
            return;
        }

        const adminChannel = await client.channels.fetch(CONFIG.adminChannelId).catch(() => null);
        if (!adminChannel || !adminChannel.isTextBased()) return;

        const count = reaction.count ?? 0;
        await adminChannel.send(`Reaction ${action}: ${user.tag} -> ${emoji} (итого ${count}) на сообщении ${message.id}`);
    }
}

client.on('messageReactionAdd', async (reaction, user) => {
    if (reaction.partial) {
        try {
            await reaction.fetch();
        } catch (error) {
            console.error('Ошибка при получении сообщения:', error);
            return;
        }
    }

    await handleReactionUpdate(reaction, user, 'Добавлено');
});

client.on('messageReactionRemove', async (reaction, user) => {
    await handleReactionUpdate(reaction, user, 'Удалено');
});

client.login(TOKEN);
