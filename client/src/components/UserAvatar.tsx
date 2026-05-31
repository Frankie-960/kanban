interface UserAvatarProps {
  name: string;
  size?: number;
}

export default function UserAvatar({ name, size = 36 }: UserAvatarProps) {
  return (
    <div style={{
      width: size,
      height: size,
      borderRadius: 8,
      background: '#1677FF',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      color: '#fff',
      fontWeight: 500,
      fontSize: size === 36 ? 14 : 16,
      flexShrink: 0,
    }}>
      {name.charAt(0)}
    </div>
  );
}