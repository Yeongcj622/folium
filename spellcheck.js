// Folium Custom English Spell Checker — pure JS, no browser spellcheck
(function (global) {
'use strict';

// ─────────────────────────────────────────────────────────────────────────────
//  WORD LIST  (base forms; morph expansion below adds ~3× more valid forms)
// ─────────────────────────────────────────────────────────────────────────────
const RAW = `
a able aboard about above absent absolute absorb abstract accent accept access
accident account accurate achieve acid acknowledge acquire across act action
active actual add address adjust admit adopt advance advice advise affect
afford afraid after afternoon again against age ago agree ahead aid aim air
alarm alert alive all allow almost alone along already alright also although
always amaze amend amid among amount analyze ancient anger announce annual
answer apart appeal appear apply approach approve area argue around arrange
arrive art article aside ask aspect assign assist assume attempt attend
authority available avoid aware

back balance base basic basis beat become before begin behind believe below
beneath beside better between beyond bind block board body bond book bottom
bound box break brief bright bring broad burden burn

call calm cancel capacity care carry catch cause center certain chain
challenge change channel charge charge chart cheap check choice choose circle
city claim clarify class clean clear clever close collect come common compare
complete concern condition connect consider contain continue count cover
create cross crowd

damage deal decide define delay deliver demand deny depend describe design
despite detect detail determine develop differ direct discover discuss draw
drive drop

earn ease edge effect emerge enable encourage end ensure entire entry equal
evaluate even exist extend

face factor fail fall feel few field fight focus follow force form
free full further

gain generate give goal guide

handle happen hard harm help hold hope host

identify ignore impact improve include increase indicate influence inform
initial interact involve issue

join judge

keep kind

lack launch link list live load locate

maintain manage matter measure meet mind monitor move must

name need notice

obtain offer operate order organize own

participate pay perform phase plan present prevent produce provide

raise reach realize receive relate release report represent request require
research resolve respond result return reveal review rise

save seek select send serve set share sign solve speak start stay stop study
submit suggest support switch

target tell tend test trace track transfer transform trust turn

understand update use

visit

wait want work

address advice agree align already analyze answer appear apply approach
approve assume attempt automate avoid

build balance base best better block bring

calculate capture change check complete connect consider control correct cost
create

data decide define deliver design detect develop display document

enable enter establish evaluate examine execute expect express

fail feature find finish fix flow follow format function

generate get give grow guide

handle have help highlight

identify implement improve include indicate install integrate introduce issue

join join justify

keep know

label lead learn link load locate

maintain make manage measure meet monitor move

name navigate note

obtain offer open optimize organize output

perform plan prepare process produce provide publish

reach record reduce remove replace require resolve respond result review

save schedule search select send serve set share show solve start stop store
submit suggest support

test transfer trigger type

update use

validate verify view

wait work

able active actual additional adequate available basic capable certain clear
common complete consistent correct current direct easy effective efficient
equal exact existing expected external final full functional general global
good great hard high immediate important internal large local long low main
major maximum minimum minor modern multiple necessary new normal open original
own potential primary private proper public real regular relevant required
right secondary serious significant simple single slow small specific standard
strong successful sufficient top total true typical unique useful various whole
wide

accurate amazing ancient angry beautiful bright calm careful cheap clever cold
comfortable confident creative curious cute dangerous decisive dense dynamic
easy elegant empty enormous exciting expensive experienced expert extreme fair
familiar famous fantastic flat flexible formal friendly gentle happy healthy
heavy honest huge humble ideal independent informal intelligent interesting
kind logical loud natural nice obvious perfect plain pleasant positive powerful
practical precise professional quick quiet rare reasonable reliable rich round
safe secure sharp short smart smooth social soft special stable straight
strange strict suitable super talented tall thick thin tough traditional
transparent urban valuable vital warm wild wise wonderful wrong

absolutely actually also always carefully certainly clearly completely
constantly currently deeply definitely directly easily effectively especially
essentially eventually exactly extremely finally frequently fully generally
greatly hardly highly immediately initially instead largely likely mainly
mostly nearly normally obviously often only originally particularly perhaps
possibly primarily probably properly quickly rather recently relatively
seriously significantly simply slightly sometimes soon specifically strongly
successfully suddenly technically together totally typically usually very
virtually well widely

a an the this that these those each every either neither some any all both
half several few many much more most less least own other another such what
which whatever whichever whose

i you he she it we they me him her us them my your his its our their mine
yours hers ours theirs myself yourself himself herself itself ourselves
themselves who whom whoever whomever

and or but nor for yet so although because since while whereas whether if
unless until as when whenever where wherever though even both either neither
not rather however therefore thus hence moreover furthermore meanwhile
nevertheless nonetheless otherwise instead then also still already yet just

about above across after against along among around as at before behind below
beneath beside besides between beyond by despite down during except for from
in inside into like near of off on onto out outside over past since than
through throughout to toward towards under underneath until up upon via with
within without

oh ok yes no please thanks sorry hello goodbye hi bye hey wow well sure okay
right great fine good bad

is are was were be been being have has had do does did will would shall should
may might must can could need ought used let

the be to of and a in that have it for not on with he as you do at this but
his by from they we say her she or an will my one all would there their what
so up out if about who get which go me when make can like time no just him
know take people into year your some could them see other than then now look
only come its over think also back after use two how our work first well way
even new want because any these give day most us

go goes going went gone get gets getting got gotten make makes making made
take takes taking took taken come comes coming came see sees seeing saw seen
know knows knowing knew known think thinks thinking thought say says saying
said tell tells telling told give gives giving gave given find finds finding
found feel feels feeling felt leave leaves leaving left put puts putting
keep keeps keeping kept let lets letting begin begins beginning began begun
show shows showing showed shown hear hears hearing heard write writes writing
wrote written read reads reading hold holds holding held bring brings bringing
brought sit sits sitting sat stand stands standing stood lose loses losing lost
meet meets meeting met win wins winning won pay pays paying paid spend spends
spending spent grow grows growing grew grown fall falls falling fell fallen
cut cuts cutting run runs running ran sell sells selling sold buy buys buying
bought send sends sending sent build builds building built speak speaks
speaking spoke spoken choose chooses choosing chose chosen teach teaches
teaching taught draw draws drawing drew drawn drive drives driving drove driven
fly flies flying flew flown wear wears wearing wore worn catch catches catching
caught throw throws throwing threw thrown eat eats eating ate eaten drink
drinks drinking drank drunk sleep sleeps sleeping slept wake wakes waking woke
woken lend lends lending lent break breaks breaking broke broken ride rides
riding rode ridden forget forgets forgetting forgot forgotten sing sings
singing sang sung swim swims swimming swam swum bite bites biting bit bitten
hit hits hitting hurt hurts hurting cost costs costing set sets setting shut
shuts shutting spread spreads spreading bend bends bending bent burn burns
burning burned burnt earn earns earning earned learn learns learning learned
learnt mean means meaning meant deal deals dealing dealt lead leads leading led
bleed bleeds bleeding bled feed feeds feeding fed flee flees fleeing fled
speed speeds speeding sped slide slides sliding slid bind binds binding bound
wind winds winding wound beat beats beating beaten shake shakes shaking shook
shaken hide hides hiding hid hidden rise rises rising rose risen shine shines
shining shone ring rings ringing rang rung swing swings swinging swung bring
brings bringing brought cling clings clinging clung dig digs digging dug hang
hangs hanging hung spin spins spinning spun

accept accepts accepted accepting achieve achieves achieved achieving acquire
acquires acquired acquiring act acts acted acting add adds added adding adjust
adjusts adjusted adjusting admit admits admitted admitting adopt adopts adopted
adopting advance advances advanced advancing affect affects affected affecting
afford affords afforded affording agree agrees agreed agreeing aim aims aimed
aiming allow allows allowed allowing analyze analyzes analyzed analyzing
announce announces announced announcing answer answers answered answering
appear appears appeared appearing apply applies applied applying approach
approaches approached approaching approve approves approved approving argue
argues argued arguing arrange arranges arranged arranging arrive arrives arrived
arriving ask asks asked asking assign assigns assigned assigning assist assists
assisted assisting assume assumes assumed assuming attempt attempts attempted
attempting attend attends attended attending avoid avoids avoided avoiding

balance balances balanced balancing base bases based basing believe believes
believed believing block blocks blocked blocking borrow borrows borrowed
borrowing break breaks breaking broke browse browses browsed browsing

call calls called calling cancel cancels cancelled canceling capture captures
captured capturing care cares cared caring carry carries carried carrying
celebrate celebrates celebrated celebrating change changes changed changing
charge charges charged charging check checks checked checking claim claims
claimed claiming clarify clarifies clarified clarifying clean cleans cleaned
cleaning clear clears cleared clearing click clicks clicked clicking close
closes closed closing collect collects collected collecting combine combines
combined combining communicate communicates communicated communicating compare
compares compared comparing compete competes competed competing complete
completes completed completing configure configures configured configuring
confirm confirms confirmed confirming connect connects connected connecting
consider considers considered considering contact contacts contacted contacting
contain contains contained containing continue continues continued continuing
control controls controlled controlling convert converts converted converting
coordinate coordinates coordinated coordinating copy copies copied copying
cover covers covered covering create creates created creating

decide decides decided deciding define defines defined defining delay delays
delayed delaying deliver delivers delivered delivering describe describes
described describing design designs designed designing detect detects detected
detecting determine determines determined determining develop develops developed
developing discuss discusses discussed discussing display displays displayed
displaying download downloads downloaded downloading

edit edits edited editing enable enables enabled enabling engage engages
engaged engaging ensure ensures ensured ensuring enter enters entered entering
establish establishes established establishing evaluate evaluates evaluated
evaluating exist exists existed existing expand expands expanded expanding
expect expects expected expecting explain explains explained explaining export
exports exported exporting extend extends extended extending

fail fails failed failing finish finishes finished finishing focus focuses
focused focusing follow follows followed following format formats formatted
formatting generate generates generated generating guide guides guided guiding

handle handles handled handling happen happens happened happening help helps
helped helping highlight highlights highlighted highlighting hope hopes hoped
hoping

identify identifies identified identifying ignore ignores ignored ignoring
implement implements implemented implementing import imports imported importing
improve improves improved improving include includes included including increase
increases increased increasing indicate indicates indicated indicating inform
informs informed informing insert inserts inserted inserting install installs
installed installing integrate integrates integrated integrating involve involves
involved involving

join joins joined joining judge judges judged judging justify justifies
justified justifying

launch launches launched launching link links linked linking listen listens
listened listening load loads loaded loading locate locates located locating
log logs logged logging

maintain maintains maintained maintaining manage manages managed managing
mark marks marked marking measure measures measured measuring modify modifies
modified modifying monitor monitors monitored monitoring move moves moved moving

name names named naming navigate navigates navigated navigating need needs
needed needing notice notices noticed noticing

obtain obtains obtained obtaining offer offers offered offering open opens
opened opening operate operates operated operating organize organizes organized
organizing

participate participates participated participating perform performs performed
performing plan plans planned planning prepare prepares prepared preparing
present presents presented presenting prevent prevents prevented preventing
process processes processed processing produce produces produced producing
provide provides provided providing publish publishes published publishing

reach reaches reached reaching realize realizes realized realizing receive
receives received receiving record records recorded recording reduce reduces
reduced reducing refer refers referred referring release releases released
releasing remove removes removed removing repeat repeats repeated repeating
replace replaces replaced replacing report reports reported reporting request
requests requested requesting require requires required requiring research
researches researched researching resolve resolves resolved resolving respond
responds responded responding retrieve retrieves retrieved retrieving return
returns returned returning review reviews reviewed reviewing

save saves saved saving scan scans scanned scanning search searches searched
searching select selects selected selecting separate separates separated
separating serve serves served serving share shares shared sharing sort sorts
sorted sorting start starts started starting stop stops stopped stopping store
stores stored storing study studies studied studying submit submits submitted
submitting suggest suggests suggested suggesting support supports supported
supporting switch switches switched switching

target targets targeted targeting test tests tested testing track tracks
tracked tracking transfer transfers transferred transferring transform transforms
transformed transforming trigger triggers triggered triggering trust trusts
trusted trusting

update updates updated updating upload uploads uploaded uploading use uses
used using

validate validates validated validating verify verifies verified verifying
view views viewed viewing visit visits visited visiting

wait waits waited waiting want wants wanted wanting watch watches watched
watching work works worked working

ability access account achievement action activity address advantage advice age
agent agreement aim air alarm alert amount analysis application approach area
article aspect assessment assignment asset attention audience author

background balance base basis behavior belief benefit board body book brand
building business

capital category cause challenge change channel character choice city client
code comment company concept concern condition content context control cost
culture customer

data date deadline decision deliverable department description design detail
development direction document

economy effect effort element environment equipment error event evidence
example experience

factor failure feature file focus form format framework function future

goal group growth guide

idea image impact information input interest issue item

key knowledge

layer level list location

management market material measure meeting message method model module

network note

objective option organization output

page part pattern performance plan platform point policy practice process
product program project property

question

range relationship report resource result role

scenario section service session setting solution source standard status step
strategy structure style summary support system

task technology term test time tool topic type

value version

way world

ability absence access account accuracy achievement acquisition action activity
agenda alert algorithm allocation amount analysis application appointment
approval area argument arrangement assessment asset association assumption
atmosphere attempt audience authorization availability

background backup balance batch behavior benefit boundary branch budget buffer

cache calculation capacity category certificate chain challenge change channel
chapter choice chunk class client cluster code collection column command
component configuration connection constraint container control convention
conversion copy cost coverage cycle

data date decision definition delivery deployment description design destination
detail device difference direction division document domain

edge effect efficiency element endpoint entry environment error evaluation event
example exception execution extension

feature field filter flow function

gap gateway goal graph group

identity implementation index information input instance integration interface
investigation iteration

job

key keyword

label layer layout level library limit link list location log logic

management mapping margin marker measurement menu message method migration mode
model module

namespace network node

object objective operation option order origin output

package parameter path permission pipeline platform policy port process product
profile project property protocol

query queue

range record reference region release request resource response restriction
result role rule

sample scenario schema scope section segment selection sequence service session
setting source specification stage standard state storage structure style
summary symbol system

table task template term threshold timeline token trigger type

unit update user

validation value version

warning weight

address advice agenda analysis approach article assessment attribute audit

base baseline batch benchmark benefit

capability category certificate change check choice class code column comment
component configuration confirmation context conversion correction coverage

data decision definition delivery department design detail development direction
discovery document driver

efficiency element entry environment evaluation event exception execution

feature field focus form framework function

gap goal group growth

handling hierarchy history

idea image implementation improvement incident

job justification

key

label layer lifecycle limit list

management map measure metric model module

name network

object objective option organization

package parameter performance plan platform point policy priority process
profile project proposal

quality query question queue

range record reference release report requirement resource result review risk
role

sample scenario schedule scope section service specification stage status step
strategy structure support

target task template term test timeline tool topic type

unit update usage

validation value version

warning workflow

ability access accuracy action activity addition address adjustment adoption
advantage advice agreement aim air alarm alert allocation allowance alternative
ambition amendment analysis answer appeal approach approval area argument
arrangement assessment assignment assistance assumption attempt attendance
attitude authority availability

background base basis benefit body boundary breakdown bridge budget

call capacity case cause challenge change channel character charge check choice
code comment commitment company comparison completion compliance condition
confirmation conflict connection consideration context contribution control
convention coordination cost coverage creation

data date deadline decision delivery demand design detail development difference
direction discovery discussion distribution document

edge effect efficiency element engagement entry environment error estimate event
evidence examination example exception execution extension

factor failure feature flow focus form function

gap goal group growth

handling hierarchy history

identification implementation improvement incident independence indication
information initiative insight integration interaction investigation

justification

key knowledge

layer level link list location

management mapping measure metric model module

name need note

objective operation option order outcome

package parameter path performance plan platform point policy practice priority
process product project property proposal protocol

quality query

range record reference relationship release report requirement resource result
review risk role

sample scenario scope section service setting solution source specification
stage standard status step strategy structure summary support system

target task template term test timeline tool topic trend type

unit update usage

validation value version

warning work workflow

abstract accuracy achievement action activity addition address adjustment
advantage affect amount analysis answer appeal approach area arrangement aspect
assessment attribute authority

balance base basis benefit body

calculation capability capacity case cause challenge change channel choice
circumstance claim code collection comment commitment comparison completion
component condition confirmation connection consideration contribution control
convention correlation cost coverage creation cycle

data date deadline decision definition delivery demand design difference
direction discovery distribution

effect efficiency element engagement entry evidence examination exception
execution extension

factor failure feature flow focus form framework function

goal group growth

handling history

identification implication improvement independence indication initiative
insight interaction investigation

justification

key knowledge

layer limitation link list location

management mapping measure merit model module

name need network note

observation objective option order outcome

path performance plan platform point policy practice priority process product
project property proposal

quality

range record reference relationship release report requirement resource result
review risk role

scenario scope section service setting solution source specification stage
standard status step strategy structure support system

target task template term test timeline tool topic trend type

unit update usage

validation value version

warning work workflow

about achieve action actually add allow also another apply area around because
build can change clear close come common completely consider create current day
deep design determine direct during each effort else enable ensure even every
example fact field find focus form full give global hard have help high impact
include involve issue large last lead like likely long look low make many may
model most move much must near need never next note only open other over own
part plan possible potential present problem process provide reach real reason
require result review right role same seem set short show simple since so
solve soon source specific start state step still strong such support system
take than think through today together top try under until use well while whole
within

about above across after against along among around at before behind below
beside between beyond by during except for from in inside into near of off on
onto out outside over past since through throughout to toward under until up
upon via with within without

across along around back down forward here in off on out over there through up

account age aim area art base best book break call case chance change choice
class close come core cost course cut day deal deep draw drive end face fall
far feel form free full gap give grow hand hard head high hold hope issue key
kind lead leave level life light like line link list long look low make move
name need next note old one open order own pass past place plan point pull push
put range reach read right rise road role round run seem serve set short show
sign size slow small sort start step stop take talk test think time try turn
view wait walk wide work write wrong year

act age air art bed big bit box car cut day did dog ear end eye far few god got
had him his hot how hub hub ice its job key law let lie low map men mix now odd
off oil one our out own pay per put raw run set sky sun ten the tip top two war
was way who why win won yet you

able ago ago any are ask bad can did did due far few fit fun get got had has
her him his hot how hub ice its job key law let lie lot low map new not now odd
off old one our out own pay per put raw run set sky sun ten tip top two war
was way why win yes yet you

according along already also although always among another around as asked
being better both bring called came changed checked close come comes consider
could day days deal decided despite different during each early else enough even
every example fact feel felt first found from get give given goes got great had
hard have having her here him his hope how however if important in include into
its just keep kind know large last later let like likely little look made make
many may me more most need new next no not nothing now number of off often one
only other our out over own part people plan point possible provide put reach
real really reason recently result return right said same see seem set she show
since small so some soon start still such take than that the their them then
there they thing think this though three through time today together too took
towards two under until up us used view want was we well were what when where
which while who why will with work world would year years yet you your

april august christmas day december fall february friday holiday january july
june march monday morning november october saturday spring summer sunday
thursday tuesday wednesday week weekend winter

africa america asia australia britain canada china england europe france germany
india ireland italy japan london paris russia spain

above account achieve add ahead aimed allow along also answer apply around ask
base been better both bring bring can certainly change choose consider create
currently decide define deliver enable end enough ensure establish find focus
form given go goals help identify improve include keep lead look make meet move
need next note now offer only open order pay place plan please point provide
put reach reason reduce relate remain require research result return right run
save search select seem serve set show since start stay stop study suggest
support take tell test try turn update use wait want work yet

english language text word sentence paragraph document book page chapter
article note letter email message content draft revision edit copy paste delete
select all format bold italic underline font size color heading subtitle body
caption table column row cell header footer margin border align center left
right justify

agenda board brief budget business calendar case client colleague company cost
deadline decision department director executive finance forecast goal growth
hire industry initiative investment issue leader management manager meeting
metric milestone mission objective opportunity organization outcome performance
pipeline policy portfolio position presentation priority process profit project
proposal protocol quarter report resource revenue risk roadmap role schedule
scope stakeholder statement strategy target team timeline vision

algorithm application architecture array browser cache cloud code component
configuration database debug deployment device documentation domain endpoint
environment error execution extension feature file framework function gateway
hardware implementation infrastructure integration interface internet library
menu metadata method module monitor network object operation output package
parameter platform plugin protocol query repository request response script
security server service session software source specification stack storage
syntax template terminal token update variable version website

academic assignment bibliography certificate chapter citation class course
curriculum degree diploma discussion education essay exam experiment grade
hypothesis knowledge lecture lesson library outline paragraph problem professor
question quiz reference research school section solution student subject
syllabus teacher thesis topic tutorial

biology carbon cell chemical chemistry compound conclusion density discovery
element energy equation evolution experiment force formula gene gravity
hypothesis investigation laboratory mass material measurement molecule
observation organism particle physics potential pressure property reaction
relationship result solution substance temperature theory variable velocity wave

activity adventure animal art beach bird boat book building camp car city
coast countryside culture dance dog event farm festival film flower food
forest garden game gift holiday home hotel island journey landscape local
market mountain museum music nature ocean park party path pet picture place
plant rain road sea show sky sport summer sun trip village walk water weather

afternoon century date decade evening hour midnight minute moment month
morning night noon period second today tomorrow tonight week year yesterday
age era generation instant century

arms back body bone brain chest ear eye face finger foot hand head heart leg
lip mouth neck nose shoulder skin stomach throat thumb toe tongue tooth wrist

brother child daughter family father grandfather grandmother husband mother
parent sister son wife

add allow also answer apply around ask based begin between build call can carry
change check choose close come complete connect consider continue control cost
could cover create decide define deliver design develop discuss end ensure
establish expect find finish focus follow form get give go guide handle help
identify improve include increase indicate install know launch let link load
maintain manage make measure meet monitor move need open organize pay perform
plan prepare present prevent process provide reach record reduce remain remove
replace require resolve respond result return review run save select send serve
set share show sort start stay stop store study submit suggest support take
tell test track transfer try turn understand update use validate verify view
visit wait want work write

absolutely actually also always appear around away back before better build
call carefully certain change check clearly close come completely connect
consider content control create decide define design different direct during
easy effect end ensure enter even every example exist expect experience explain
extend far feel field finally finish fit focus follow form forward full further
give great grow guide happen hard have help high hold home hope identify
improve include keep know lead learn like likely link list local long look make
manage measure meet more most need new next note now open organize over own
part pay perform plan point present provide reach realize receive record reduce
refer relate remain report require resolve respond result right run save search
select send set share show specific start stay stop study submit suggest
support take test track try type update use view wait work

again also always another around back before both certain check clear come
complete connect consider continue could current cut data date day deep define
develop difficult direct during each easily effort end even ever every example
explain extra fail far feel final find finish first follow form full further get
give go good grow guide hand hard have help high hold home how important include
increase keep know large last like likely link little local long look low main
make many may most move much need new next note now often only open option order
own part pay perform place plan point possible provide put reach real reason
result right role run same seem set short show simple since small some start
still support take tell than think through today together top try turn under
update use very wait want way well while within work world write yet you

a able about above achieve act active actually add allow along already also
although and another any apply are around ask at away back base be become
before begin being between both build but by call can change check choose clear
close come common completely consider continue could create current data date
day decide define design develop direct do during each edit effect ensure even
every example experience explain find first focus follow form from full
function get give go grow handle happen have help how identify if improve
include increase into issue just keep know large last lead learn let like link
list local long look make manage may mean measure meet model more most move much
my name need new next not note now of often on only open or order other our
out own page part perform plan point present process provide reach record reduce
refer remain remove replace require research resolve result return review right
run same search select seem send set show simple so some sort start stay stop
store study submit suggest support take test think time to today together try
type under update use value view wait want well when which while with within
work write you your

accommodate accommodation accompanied accompanying accomplish accomplished
acknowledgment acknowledgement acquaintance across aggressive although
apparently appearance argument auxiliary beginning believe calendar committee
committed completely conscience conscious correspondence definitely development
disappear disappear disappoint embarrass embarrassed environment equipped
especially exaggerate existence explanation February foreign guarantee height
hygiene immediately independent judgment knowledge liaison library lieutenant
maintenance maneuver mediterranean millennium miniature miscellaneous necessary
neighbor noticeable occasionally occurrence omission parliament perform
permissible personnel possession preceding prejudice privilege profession
proceed pronunciation publicly questionnaire receive recommend referred
renaissance repetition responsible restaurant rhythm secretary sentence
separate sergeant several similar specifically strength successful supersede
thorough threshold until usually vacuum valuable vegetable Wednesday whether
weird wholly
`;


// ─────────────────────────────────────────────────────────────────────────────
//  BUILD DICTIONARY
// ─────────────────────────────────────────────────────────────────────────────
const DICT = new Set();

// Simple suffix rules to expand base forms  (irregular forms are in RAW above)
function expandForms(w) {
    const out = [w];
    const e = w.endsWith.bind(w);
    const last = w[w.length - 1];
    const last2 = w.slice(-2);
    const last3 = w.slice(-3);
    const vowels = new Set(['a','e','i','o','u']);
    const prevVowel = w.length >= 2 && vowels.has(w[w.length-2]);

    // ---- PLURALS / 3rd-person singular ----
    if (e('s') || e('x') || e('z') || e('ch') || e('sh')) {
        out.push(w + 'es');
    } else if (e('y') && !vowels.has(w[w.length-2])) {
        out.push(w.slice(0,-1) + 'ies');
        out.push(w + 's'); // "days" etc.
    } else if (e('fe')) {
        out.push(w.slice(0,-2) + 'ves');
    } else if (e('f') && !e('ff')) {
        out.push(w.slice(0,-1) + 'ves');
    } else {
        out.push(w + 's');
    }

    // ---- PAST TENSE / PAST PARTICIPLE ----
    if (e('e') && !e('ee')) {
        out.push(w + 'd');
        out.push(w.slice(0,-1) + 'ing');
    } else if (e('y') && !vowels.has(w[w.length-2])) {
        out.push(w.slice(0,-1) + 'ied');
        out.push(w + 'ing');
    } else if (e('ie')) {
        out.push(w.slice(0,-2) + 'ied');
        out.push(w.slice(0,-2) + 'ying');
    } else {
        out.push(w + 'ed');
        out.push(w + 'ing');
    }

    // ---- COMPARATIVE / SUPERLATIVE ----
    if (e('e') && !e('ee')) {
        out.push(w + 'r');
        out.push(w + 'st');
    } else if (e('y') && !vowels.has(w[w.length-2])) {
        out.push(w.slice(0,-1) + 'ier');
        out.push(w.slice(0,-1) + 'iest');
    } else {
        out.push(w + 'er');
        out.push(w + 'est');
    }

    // ---- ADVERB ----
    if (e('le') && w.length > 3) {
        out.push(w.slice(0,-1) + 'y');   // simple → simply
    } else if (e('y') && !vowels.has(w[w.length-2])) {
        out.push(w.slice(0,-1) + 'ily'); // happy → happily
    } else if (e('ic')) {
        out.push(w + 'ally');
    } else {
        out.push(w + 'ly');
    }

    // ---- AGENT NOUN ----
    if (e('e') && !e('ee')) {
        out.push(w + 'r');       // write → writer (same as comparative, that's fine)
        out.push(w + 'rs');
    } else {
        out.push(w + 'er');
        out.push(w + 'ers');
    }

    // ---- NEGATIONS (common prefixes) ----
    out.push('un' + w);
    out.push('re' + w);
    out.push('pre' + w);

    return out;
}

function buildDictionary() {
    const words = RAW.trim().split(/\s+/);
    for (const raw of words) {
        const w = raw.toLowerCase().replace(/[^a-z']/g, '');
        if (!w || w.length < 2) continue;
        DICT.add(w);
        for (const f of expandForms(w)) {
            if (f && f.length >= 2) DICT.add(f);
        }
    }
    // Common contractions both with and without apostrophe
    const contractions = ["aren't","can't","couldn't","didn't","doesn't","don't",
        "hadn't","hasn't","haven't","he'd","he'll","he's","i'd","i'll","i'm","i've",
        "isn't","it's","let's","mightn't","mustn't","needn't","she'd","she'll",
        "she's","shouldn't","that's","there's","they'd","they'll","they're","they've",
        "wasn't","we'd","we'll","we're","we've","weren't","what's","where's","who'd",
        "who'll","who's","who've","won't","wouldn't","you'd","you'll","you're","you've"];
    for (const c of contractions) {
        DICT.add(c);
        DICT.add(c.replace(/'/g, '')); // also without apostrophe
    }
    // Load custom words from localStorage
    try {
        const custom = JSON.parse(localStorage.getItem('sc_custom') || '[]');
        for (const w of custom) DICT.add(w.toLowerCase());
    } catch(e) {}
}

// ─────────────────────────────────────────────────────────────────────────────
//  NORVIG-STYLE SUGGESTION ENGINE
// ─────────────────────────────────────────────────────────────────────────────
const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

function edits1(word) {
    const results = new Set();
    // Deletions
    for (let i = 0; i < word.length; i++)
        results.add(word.slice(0,i) + word.slice(i+1));
    // Transpositions
    for (let i = 0; i < word.length-1; i++)
        results.add(word.slice(0,i) + word[i+1] + word[i] + word.slice(i+2));
    // Replacements
    for (let i = 0; i < word.length; i++)
        for (const c of ALPHABET)
            results.add(word.slice(0,i) + c + word.slice(i+1));
    // Insertions
    for (let i = 0; i <= word.length; i++)
        for (const c of ALPHABET)
            results.add(word.slice(0,i) + c + word.slice(i));
    return results;
}

function suggest(word, max = 7) {
    if (!word) return [];
    const lower = word.toLowerCase();
    if (DICT.has(lower)) return [];

    // Distance-1 candidates in dictionary
    const e1 = [];
    for (const c of edits1(lower)) if (DICT.has(c)) e1.push(c);
    if (e1.length) {
        // Sort by length similarity first, then alphabetically
        e1.sort((a,b) => Math.abs(a.length - lower.length) - Math.abs(b.length - lower.length) || a.localeCompare(b));
        return e1.slice(0, max);
    }

    // Distance-2 candidates (only from distance-1 set that exist in dict)
    const seen = new Set(e1);
    const e2 = [];
    for (const c1 of edits1(lower)) {
        for (const c2 of edits1(c1)) {
            if (DICT.has(c2) && !seen.has(c2)) { e2.push(c2); seen.add(c2); }
        }
    }
    e2.sort((a,b) => Math.abs(a.length - lower.length) - Math.abs(b.length - lower.length) || a.localeCompare(b));
    return e2.slice(0, max);
}

// ─────────────────────────────────────────────────────────────────────────────
//  WORD CHECK
// ─────────────────────────────────────────────────────────────────────────────
const ignoredThisSession = new Set();

function shouldSkip(word) {
    if (!word || word.length < 2) return true;
    if (/\d/.test(word)) return true;                   // contains digit
    if (/^[A-Z]{2,}$/.test(word)) return true;          // ALL CAPS acronym
    if (/[A-Z]/.test(word.slice(1))) return true;       // camelCase / PascalCase
    if (word.includes('/') || word.includes('\\')) return true;
    if (word.startsWith("'") || word.endsWith("'")) return true;
    return false;
}

function isCorrect(word) {
    if (shouldSkip(word)) return true;
    const lower = word.toLowerCase();
    if (ignoredThisSession.has(lower)) return true;
    return DICT.has(lower);
}

function addToCustom(word) {
    const lower = word.toLowerCase();
    DICT.add(lower);
    ignoredThisSession.delete(lower);
    try {
        const arr = JSON.parse(localStorage.getItem('sc_custom') || '[]');
        if (!arr.includes(lower)) { arr.push(lower); localStorage.setItem('sc_custom', JSON.stringify(arr)); }
    } catch(e) {}
}

function ignoreWord(word) {
    ignoredThisSession.add(word.toLowerCase());
}

// ─────────────────────────────────────────────────────────────────────────────
//  DOM HIGHLIGHTING  (apply / remove  spell-error spans in a .text-edit-box)
// ─────────────────────────────────────────────────────────────────────────────

// Walk text nodes in `root`, wrap misspelled words in <span data-se="1" class="spell-error">
function applyHighlights(div) {
    if (!div) return;

    removeHighlights(div); // clear any old markers first

    const walker = document.createTreeWalker(div, NodeFilter.SHOW_TEXT, {
        acceptNode(node) {
            const p = node.parentElement;
            // Skip text inside existing spell-error spans and non-content elements
            if (p && (p.dataset.se || p.tagName === 'SCRIPT' || p.tagName === 'STYLE')) {
                return NodeFilter.FILTER_REJECT;
            }
            return NodeFilter.FILTER_ACCEPT;
        }
    });

    const textNodes = [];
    let n;
    while ((n = walker.nextNode())) textNodes.push(n);

    for (const textNode of textNodes) {
        const text = textNode.textContent;
        const re = /[a-zA-Z']+/g;
        let match;
        let hasError = false;

        // Pre-scan: skip text nodes with no errors (fast path)
        const tmpRe = /[a-zA-Z']+/g;
        while ((match = tmpRe.exec(text)) !== null) {
            const raw = match[0].replace(/^'+|'+$/g, '');
            if (raw.length >= 2 && !isCorrect(raw)) { hasError = true; break; }
        }
        if (!hasError) continue;

        // Build a fragment that splits the text around misspelled-word spans
        const frag = document.createDocumentFragment();
        let cursor = 0;
        re.lastIndex = 0;
        while ((match = re.exec(text)) !== null) {
            const raw = match[0].replace(/^'+|'+$/g, '');
            if (raw.length < 2 || isCorrect(raw)) continue;

            // Text before this match
            if (match.index > cursor) {
                frag.appendChild(document.createTextNode(text.slice(cursor, match.index)));
            }
            // Span for misspelled word
            const span = document.createElement('span');
            span.dataset.se = '1';
            span.className = 'spell-error';
            span.textContent = match[0];
            frag.appendChild(span);
            cursor = match.index + match[0].length;
        }
        // Remaining text after last match
        if (cursor < text.length) {
            frag.appendChild(document.createTextNode(text.slice(cursor)));
        }

        textNode.parentNode.replaceChild(frag, textNode);
    }
}

function removeHighlights(div) {
    if (!div) return;
    div.querySelectorAll('[data-se]').forEach(span => {
        const parent = span.parentNode;
        while (span.firstChild) parent.insertBefore(span.firstChild, span);
        parent.removeChild(span);
    });
    // Merge adjacent text nodes to keep the DOM clean
    div.normalize();
}

// ─────────────────────────────────────────────────────────────────────────────
//  SPELL CHECK ALL — returns [{slideIdx, objId, obj, errors:[{word,context}]}]
// ─────────────────────────────────────────────────────────────────────────────
function stripHtmlTags(html) {
    const d = document.createElement('div');
    d.innerHTML = html || '';
    return d.textContent || '';
}

function checkObjectText(text) {
    const plain = stripHtmlTags(text);
    const re = /[a-zA-Z']+/g;
    let m;
    const errors = [];
    while ((m = re.exec(plain)) !== null) {
        const raw = m[0].replace(/^'+|'+$/g, '');
        if (raw.length >= 2 && !isCorrect(raw)) {
            const start = Math.max(0, m.index - 20);
            const end   = Math.min(plain.length, m.index + m[0].length + 20);
            errors.push({ word: raw, context: plain.slice(start, end).trim() });
        }
    }
    return errors;
}

// ─────────────────────────────────────────────────────────────────────────────
//  INIT
// ─────────────────────────────────────────────────────────────────────────────
buildDictionary();

global.SC = {
    isCorrect,
    suggest,
    addToCustom,
    ignoreWord,
    applyHighlights,
    removeHighlights,
    checkObjectText,
    stripHtmlTags,
    get size() { return DICT.size; }
};

})(window);
