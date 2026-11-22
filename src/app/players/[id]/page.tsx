import type { Metadata } from "next";
import { notFound } from "next/navigation";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { ArrowLeft, BarChart2, Goal, Shield, Flag, Award, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import PlayerPointsChart from "@/components/features/players/player-points-chart";
import PlayerHeader from "@/components/features/players/player-header";
import { getFormColor } from "@/hooks/use-player-utils";
import { getSnapshot } from "@/lib/data";
import { buildPlayerDetail, type PlayerDetail } from "@/lib/fpl";
import { playerMetadata, playerNotFoundMetadata } from "@/lib/metadata";

// Every player page is generated at build time; unknown ids are a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return getSnapshot().bootstrap.elements.map((e) => ({ id: String(e.id) }));
}

function findPlayer(id: string): PlayerDetail | null {
  const snapshot = getSnapshot();
  const element = snapshot.bootstrap.elements.find((e) => String(e.id) === id);
  if (!element) return null;
  return buildPlayerDetail(snapshot.bootstrap, element, snapshot.summaries[element.id]);
}

export async function generateMetadata({ params }: PageProps<"/players/[id]">): Promise<Metadata> {
  const player = findPlayer((await params).id);
  return player ? playerMetadata(player) : playerNotFoundMetadata;
}

type Stat = { label: string; value: React.ReactNode; className?: string };

function StatCard({ title, icon: Icon, stats }: { title: string; icon: LucideIcon; stats: Stat[] }) {
  return (
    <Card className="rounded-xl border border-green-200 dark:border-green-900 bg-white/90 shadow-2xl dark:bg-gray-800/80 pt-5 pb-5 px-3">
      <CardHeader>
        <CardTitle className="text-lg font-bold text-gray-900 dark:text-white tracking-wide mb-0 flex items-center gap-2">
          <Icon className="w-5 h-5" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-1">
        {stats.map((s) => (
          <div key={s.label} className="flex justify-between items-center">
            <span className="text-gray-400 dark:text-gray-400 text-base">{s.label}</span>
            <span className={`font-extrabold text-lg ${s.className ?? "text-gray-900 dark:text-white"}`}>
              {s.value}
            </span>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export default async function PlayerPage({ params }: PageProps<"/players/[id]">) {
  const player = findPlayer((await params).id);
  if (!player) notFound();
  const s = player.stats;

  const cards: { title: string; icon: LucideIcon; stats: Stat[] }[] = [
    {
      title: "Season Statistics",
      icon: BarChart2,
      stats: [
        { label: "Total Points", value: s.total_points },
        { label: "Points Per Game", value: s.points_per_game },
        { label: "Form", value: s.form, className: getFormColor(s.form) },
        { label: "Ownership", value: `${Number(s.selected_by_percent).toFixed(1)}%` },
      ],
    },
    {
      title: "Attacking",
      icon: Goal,
      stats: [
        { label: "Goals", value: s.goals_scored },
        { label: "Assists", value: s.assists },
        { label: "Expected Goals", value: s.expected_goals },
        { label: "Expected Assists", value: s.expected_assists },
      ],
    },
    {
      title: "Defensive",
      icon: Shield,
      stats: [
        { label: "Clean Sheets", value: s.clean_sheets },
        { label: "Goals Conceded", value: s.goals_conceded },
        { label: "Saves", value: s.saves },
        { label: "Expected Goals Conceded", value: s.expected_goals_conceded },
      ],
    },
    {
      title: "Discipline",
      icon: Flag,
      stats: [
        { label: "Yellow Cards", value: s.yellow_cards },
        { label: "Red Cards", value: s.red_cards },
        { label: "Own Goals", value: s.own_goals },
        { label: "Penalties Missed", value: s.penalties_missed },
      ],
    },
    {
      title: "Performance Metrics",
      icon: Award,
      stats: [
        { label: "Influence", value: s.influence },
        { label: "Creativity", value: s.creativity },
        { label: "Threat", value: s.threat },
        { label: "ICT Index", value: s.ict_index },
      ],
    },
    {
      title: "Game Time",
      icon: Clock,
      stats: [
        { label: "Minutes Played", value: s.minutes },
        { label: "Starts", value: s.starts },
        { label: "Bonus Points", value: s.bonus },
        { label: "BPS", value: s.bps },
      ],
    },
  ];

  return (
    <div className="flex flex-col flex-1 min-h-0 p-4 max-w-7xl mx-auto w-full">
      <Link href="/players">
        <Button variant="outline" className="mb-6 text-base font-medium text-gray-900 dark:text-white">
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Players
        </Button>
      </Link>

      <div className="mb-10">
        <PlayerHeader player={player} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {cards.map((card) => (
          <StatCard key={card.title} {...card} />
        ))}
      </div>

      {player.history.length > 0 && (
        <div className="my-6">
          <Card className="rounded-xl border border-green-200 dark:border-green-900">
            <PlayerPointsChart history={player.history} />
          </Card>
        </div>
      )}
    </div>
  );
}
